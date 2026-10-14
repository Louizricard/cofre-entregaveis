import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../data/comments_repository.dart';
import '../data/revisions_repository.dart';
import '../generated/api.g.dart';

class RevisionsDialog extends ConsumerStatefulWidget {
  final String projectId;
  final String? versionId;
  final bool guest;
  final bool active;
  const RevisionsDialog({
    super.key,
    required this.projectId,
    this.versionId,
    required this.guest,
    this.active = true,
  });
  @override
  ConsumerState<RevisionsDialog> createState() => _RevisionsDialogState();
}

class _RevisionsDialogState extends ConsumerState<RevisionsDialog> {
  final _summary = TextEditingController();
  RevisionsView? _data;
  bool _busy = true;
  String? _error;
  String? _key;
  String? _payload;
  RevisionsRepository get _repo => ref.read(revisionsRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _summary.dispose();
    super.dispose();
  }

  String message(Object e) => e is ApiFailure
      ? e.message
      : 'Não foi possível concluir. Tente novamente.';
  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final data = await _repo.list(widget.projectId, guest: widget.guest);
      if (mounted) setState(() => _data = data);
    } catch (e) {
      if (mounted) setState(() => _error = message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request() async {
    final body = _summary.text.trim();
    if (body.isEmpty) {
      setState(() => _error = 'Descreva os ajustes desejados.');
      return;
    }
    final version = widget.versionId!;
    final payload = '$version\n$body';
    if (_payload != payload) {
      _key = newCommentRequestId();
      _payload = payload;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _repo.request(
        RequestRevisionDto(versionId: version, summary: body),
        _key!,
      );
      _summary.clear();
      _key = null;
      _payload = null;
      if (mounted) await _load();
    } catch (e) {
      if (mounted) setState(() => _error = message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _decide(RevisionRoundView round, String decision) async {
    var reason = '';
    final text = await showDialog<String>(
      context: context,
      builder: (context) => AlertDialog(
        title: Text(
          decision == 'ACCEPT' ? 'Aceitar rodada extra?' : 'Recusar pedido?',
        ),
        content: TextField(
          onChanged: (value) => reason = value,
          maxLength: 1000,
          maxLines: 4,
          decoration: const InputDecoration(
            labelText: 'Justificativa para o cliente',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () {
              if (reason.trim().isNotEmpty)
                Navigator.pop(context, reason.trim());
            },
            child: const Text('Confirmar'),
          ),
        ],
      ),
    );
    if (text == null || !mounted) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _repo.decide(
        round.id,
        DecideRevisionDto(decision: decision, reason: text),
      );
      if (mounted) await _load();
    } catch (e) {
      if (mounted) setState(() => _error = message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final data = _data;
    final canRequest =
        widget.guest &&
        data != null &&
        data.canRequest &&
        widget.versionId == data.currentVersionId;
    return AlertDialog(
      title: const Text('Rodadas de ajustes'),
      content: SizedBox(
        width: 560,
        child: SingleChildScrollView(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            mainAxisSize: MainAxisSize.min,
            children: [
              if (_busy) const LinearProgressIndicator(),
              if (_error != null)
                Semantics(
                  liveRegion: true,
                  child: Text(
                    _error!,
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              if (data != null) ...[
                Text(
                  '${data.used} rodadas aceitas • ${data.included} incluídas',
                ),
                const SizedBox(height: 12),
                if (canRequest) ...[
                  const Text(
                    'Reúna os comentários nos arquivos antes de enviar. O pedido fecha a coleta até a próxima versão.',
                  ),
                  if (data.used >= data.included)
                    const Text(
                      'Limite incluído atingido. Este pedido precisará da decisão do criador.',
                    ),
                  TextField(
                    controller: _summary,
                    enabled: !_busy,
                    maxLength: 4000,
                    maxLines: 4,
                    decoration: const InputDecoration(
                      labelText: 'Resumo dos ajustes',
                    ),
                  ),
                  FilledButton(
                    onPressed: _busy ? null : _request,
                    child: const Text('Pedir ajustes'),
                  ),
                ] else if (widget.guest)
                  const Text(
                    'Consulte os pedidos abaixo. Novos pedidos ficam disponíveis na versão atual quando não há outro em andamento.',
                  ),
                if (data.items.isEmpty) const Text('Nenhum pedido de ajustes.'),
                for (final r in data.items)
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(12),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'V${r.versionNumber} • ${revisionStateLabel(r.state)}${r.extra ? ' • Extra' : ''}',
                          ),
                          SelectableText(r.summary),
                          Text('${r.commentCount} comentários reunidos'),
                          if (r.decisionReason != null)
                            SelectableText('Decisão: ${r.decisionReason}'),
                          if (!widget.guest &&
                              widget.active &&
                              r.state == 'PENDING')
                            Wrap(
                              spacing: 8,
                              children: [
                                FilledButton(
                                  onPressed: _busy
                                      ? null
                                      : () => _decide(r, 'ACCEPT'),
                                  child: const Text('Aceitar extra'),
                                ),
                                OutlinedButton(
                                  onPressed: _busy
                                      ? null
                                      : () => _decide(r, 'REJECT'),
                                  child: const Text('Recusar'),
                                ),
                              ],
                            ),
                        ],
                      ),
                    ),
                  ),
              ],
            ],
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : _load,
          child: const Text('Atualizar'),
        ),
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context),
          child: const Text('Fechar'),
        ),
      ],
    );
  }
}

String revisionStateLabel(String state) => switch (state) {
  'PENDING' => 'Aguardando decisão',
  'OPEN' => 'Em ajustes',
  'RESOLVED' => 'Nova versão publicada',
  'REJECTED' => 'Recusado',
  'CANCELLED' => 'Superado pela nova versão',
  _ => state,
};
