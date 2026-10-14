import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../data/comments_repository.dart';
import '../generated/api.g.dart';

const anchorLabels = {
  'GENERAL': 'Geral',
  'TIME': 'Momento do áudio/vídeo',
  'IMAGE_POINT': 'Ponto na imagem',
  'PDF_POINT': 'Ponto no PDF',
};
String anchorLabel(CommentAnchorView a) => switch (a.kind) {
  'TIME' => 'No segundo ${(a.timeMs! / 1000).toStringAsFixed(3)}',
  'IMAGE_POINT' =>
    'Imagem • horizontal ${(a.x! * 100).toStringAsFixed(1)}%, vertical ${(a.y! * 100).toStringAsFixed(1)}%',
  'PDF_POINT' =>
    'Página ${a.page} • horizontal ${(a.x! * 100).toStringAsFixed(1)}%, vertical ${(a.y! * 100).toStringAsFixed(1)}%',
  _ => 'Geral',
};

class CommentsDialog extends ConsumerStatefulWidget {
  final String assetId;
  final String fileName;
  final bool guest;
  const CommentsDialog({
    super.key,
    required this.assetId,
    required this.fileName,
    required this.guest,
  });
  @override
  ConsumerState<CommentsDialog> createState() => _CommentsDialogState();
}

class _CommentsDialogState extends ConsumerState<CommentsDialog> {
  final _body = TextEditingController();
  final _x = TextEditingController(text: '50');
  final _y = TextEditingController(text: '50');
  final _page = TextEditingController(text: '1');
  final _time = TextEditingController(text: '0');
  final _form = GlobalKey<FormState>();
  List<CommentView> _items = [];
  CommentsView? _context;
  String? _cursor;
  String? _error;
  String? _notice;
  String _kind = 'GENERAL';
  String? _payload;
  String? _requestId;
  bool _busy = true;
  CommentsRepository get _repo => ref.read(commentsRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    for (final c in [_body, _x, _y, _page, _time]) {
      c.dispose();
    }
    super.dispose();
  }

  String _message(Object e) => e is ApiFailure
      ? e.message
      : 'Não foi possível acessar os comentários. Tente novamente.';
  Future<void> _load({bool more = false}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _repo.list(
        widget.assetId,
        guest: widget.guest,
        cursor: more ? _cursor : null,
      );
      if (mounted)
        setState(() {
          _context = result;
          _cursor = result.nextCursor;
          _items = {
            for (final c in [
              ...(more ? _items : <CommentView>[]),
              ...result.items,
            ])
              c.id: c,
          }.values.toList();
          if (!result.anchorTypes.contains(_kind)) _kind = 'GENERAL';
        });
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
          _items = [];
          _context = null;
          _cursor = null;
        });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  double? _number(String? value) =>
      double.tryParse((value ?? '').trim().replaceAll(',', '.'));
  String? _range(String? value, double max) {
    final n = _number(value);
    return n != null && n.isFinite && n >= 0 && n <= max
        ? null
        : 'Informe um valor entre 0 e $max.';
  }

  Future<void> _send() async {
    if (!_form.currentState!.validate()) return;
    final anchor = CommentAnchorDto(
      kind: _kind,
      timeMs: _kind == 'TIME' ? (_number(_time.text)! * 1000).round() : null,
      page: _kind == 'PDF_POINT' ? int.parse(_page.text) : null,
      x: ['IMAGE_POINT', 'PDF_POINT'].contains(_kind)
          ? _number(_x.text)! / 100
          : null,
      y: ['IMAGE_POINT', 'PDF_POINT'].contains(_kind)
          ? _number(_y.text)! / 100
          : null,
    );
    final body = _body.text.trim();
    final payload = jsonEncode({
      'assetId': widget.assetId,
      'body': body,
      'anchor': anchor.toJson(),
    });
    if (_payload != payload) {
      _payload = payload;
      _requestId = newCommentRequestId();
    }
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final result = await _repo.create(
        CreateCommentDto(
          assetId: widget.assetId,
          clientRequestId: _requestId!,
          body: body,
          anchor: anchor,
        ),
      );
      if (mounted)
        setState(() {
          _items =
              {
                for (final c in [..._items, result]) c.id: c,
              }.values.toList()..sort((a, b) {
                final time = a.createdAt.compareTo(b.createdAt);
                return time != 0 ? time : a.id.compareTo(b.id);
              });
          _body.clear();
          _payload = null;
          _requestId = null;
          _notice = 'Comentário enviado.';
        });
    } catch (e) {
      if (e is ApiFailure && e.status == 409) await _load();
      if (mounted)
        setState(() {
          _error = _message(e);
          if (e is ApiFailure && [401, 403].contains(e.status)) {
            _context = null;
            _items = [];
          }
        });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('Comentários • ${widget.fileName}'),
    content: SizedBox(
      width: 620,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            if (_busy) const LinearProgressIndicator(),
            if (_error != null)
              Semantics(
                liveRegion: true,
                child: Text(
                  _error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            if (_notice != null)
              Semantics(liveRegion: true, child: Text(_notice!)),
            if (!_busy && _context != null && _items.isEmpty)
              const Text('Nenhum comentário neste arquivo.'),
            for (final c in _items)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        '${c.authorLabel} • ${DateTime.parse(c.createdAt).toLocal().toString().substring(0, 16)}',
                      ),
                      Text(anchorLabel(c.anchor)),
                      SelectableText(c.body),
                    ],
                  ),
                ),
              ),
            if (_cursor != null)
              TextButton(
                onPressed: _busy ? null : () => _load(more: true),
                child: const Text('Mais comentários'),
              ),
            if (_context != null && widget.guest && !_context!.canComment)
              const Text(
                'Este arquivo está disponível para consulta. Comente na versão atual após a análise de segurança.',
              ),
            if (widget.guest && _context?.canComment == true)
              Form(
                key: _form,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const Divider(height: 24),
                    TextFormField(
                      controller: _body,
                      enabled: !_busy,
                      minLines: 2,
                      maxLines: 5,
                      maxLength: 4000,
                      decoration: const InputDecoration(
                        labelText: 'Seu comentário',
                      ),
                      validator: (v) => (v?.trim().isNotEmpty ?? false)
                          ? null
                          : 'Escreva um comentário.',
                    ),
                    DropdownButtonFormField<String>(
                      key: ValueKey(_kind),
                      initialValue: _kind,
                      isExpanded: true,
                      decoration: const InputDecoration(
                        labelText: 'Referência na prévia',
                      ),
                      items: _context!.anchorTypes
                          .map(
                            (k) => DropdownMenuItem(
                              value: k,
                              child: Text(anchorLabels[k] ?? k),
                            ),
                          )
                          .toList(),
                      onChanged: _busy
                          ? null
                          : (k) => setState(() => _kind = k!),
                    ),
                    if (_kind == 'TIME')
                      TextFormField(
                        controller: _time,
                        enabled: !_busy,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Segundo da prévia',
                        ),
                        validator: (v) =>
                            _range(v, _context!.durationMs / 1000),
                      ),
                    if (_kind == 'PDF_POINT')
                      TextFormField(
                        controller: _page,
                        enabled: !_busy,
                        keyboardType: TextInputType.number,
                        decoration: const InputDecoration(
                          labelText: 'Página do PDF',
                        ),
                        validator: (v) {
                          final n = int.tryParse(v ?? '');
                          return n != null && n >= 1 && n <= _context!.pages
                              ? null
                              : 'Informe uma página entre 1 e ${_context!.pages}.';
                        },
                      ),
                    if (['IMAGE_POINT', 'PDF_POINT'].contains(_kind)) ...[
                      const Text(
                        'Posição na prévia: 0% é a borda esquerda/superior; 100% é a borda direita/inferior.',
                      ),
                      TextFormField(
                        controller: _x,
                        enabled: !_busy,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Posição horizontal (%)',
                        ),
                        validator: (v) => _range(v, 100),
                      ),
                      TextFormField(
                        controller: _y,
                        enabled: !_busy,
                        keyboardType: const TextInputType.numberWithOptions(
                          decimal: true,
                        ),
                        decoration: const InputDecoration(
                          labelText: 'Posição vertical (%)',
                        ),
                        validator: (v) => _range(v, 100),
                      ),
                    ],
                    const SizedBox(height: 12),
                    FilledButton(
                      onPressed: _busy ? null : _send,
                      child: const Text('Enviar comentário'),
                    ),
                  ],
                ),
              ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => _load(),
        child: const Text('Atualizar comentários'),
      ),
      TextButton(
        onPressed: _busy ? null : () => Navigator.pop(context),
        child: const Text('Fechar'),
      ),
    ],
  );
}
