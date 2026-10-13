import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../data/sharing_repository.dart';
import '../generated/api.g.dart';

class SharingDialog extends ConsumerStatefulWidget {
  final String projectId;
  const SharingDialog({super.key, required this.projectId});
  @override
  ConsumerState<SharingDialog> createState() => _SharingDialogState();
}

class _SharingDialogState extends ConsumerState<SharingDialog> {
  final List<ShareView> _items = [];
  String? _cursor;
  String? _url;
  String? _newId;
  String? _error;
  String? _notice;
  bool _busy = false;
  int _days = 7;
  SharingRepository get _repo => ref.read(sharingRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _load();
  }

  String _message(Object e) => e is ApiFailure
      ? e.message
      : 'Não foi possível atualizar os links. Tente novamente.';
  Future<void> _load({bool more = false}) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _repo.list(
        widget.projectId,
        cursor: more ? _cursor : null,
      );
      if (mounted)
        setState(() {
          if (!more) _items.clear();
          _items.addAll(result.items);
          _cursor = result.nextCursor;
        });
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _create() async {
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final created = await _repo.create(
        widget.projectId,
        DateTime.now().add(Duration(days: _days)),
      );
      if (mounted)
        setState(() {
          _url = created.url;
          _newId = created.id;
        });
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _revoke(ShareView share) async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await _repo.revoke(share.id);
      if (mounted)
        setState(() {
          if (_newId == share.id) {
            _url = null;
            _newId = null;
          }
          _notice =
              'Link revogado. Novos acessos e novas prévias foram bloqueados.';
        });
      await _load();
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Compartilhar prévias'),
    content: SizedBox(
      width: 560,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text(
              'Quem tiver o link poderá visualizar as versões publicadas e suas prévias. Rascunhos e download dos originais ficam protegidos.',
            ),
            const SizedBox(height: 16),
            DropdownButtonFormField<int>(
              initialValue: _days,
              decoration: const InputDecoration(
                labelText: 'Validade do novo link',
              ),
              items: [1, 7, 30]
                  .map(
                    (n) => DropdownMenuItem(
                      value: n,
                      child: Text('$n ${n == 1 ? 'dia' : 'dias'}'),
                    ),
                  )
                  .toList(),
              onChanged: _busy ? null : (v) => setState(() => _days = v!),
            ),
            const SizedBox(height: 12),
            FilledButton(
              onPressed: _busy ? null : _create,
              child: const Text('Criar link'),
            ),
            if (_busy) const LinearProgressIndicator(),
            if (_error != null) ...[
              Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
              TextButton(
                onPressed: _busy ? null : () => _load(),
                child: const Text('Atualizar links'),
              ),
            ],
            if (_notice != null) Text(_notice!),
            if (_url != null) ...[
              const SizedBox(height: 12),
              const Text('Copie e guarde este link. Ele só é exibido agora.'),
              SelectableText(_url!),
              TextButton.icon(
                onPressed: () async {
                  try {
                    await Clipboard.setData(ClipboardData(text: _url!));
                    if (mounted) setState(() => _notice = 'Link copiado.');
                  } catch (_) {
                    if (mounted)
                      setState(
                        () => _notice = 'Selecione o link e copie manualmente.',
                      );
                  }
                },
                icon: const Icon(Icons.copy),
                label: const Text('Copiar link'),
              ),
            ],
            const Divider(height: 24),
            if (!_busy && _items.isEmpty)
              const Text(
                'Nenhum link criado. Publique uma versão antes de compartilhar.',
              ),
            for (final s in _items)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 6),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Link • criado em ${DateTime.parse(s.createdAt).toLocal().toString().substring(0, 16)}',
                    ),
                    Text(
                      s.revokedAt != null
                          ? 'Revogado'
                          : DateTime.parse(s.expiresAt).isBefore(DateTime.now())
                          ? 'Expirado'
                          : 'Válido até ${DateTime.parse(s.expiresAt).toLocal().toString().substring(0, 16)}',
                    ),
                    if (s.revokedAt == null)
                      TextButton(
                        onPressed: _busy ? null : () => _revoke(s),
                        child: const Text('Revogar link'),
                      ),
                  ],
                ),
              ),
            if (_cursor != null)
              TextButton(
                onPressed: _busy ? null : () => _load(more: true),
                child: const Text('Mais links'),
              ),
            const Text(
              'Prévias já abertas podem continuar disponíveis por até 60 segundos após revogar.',
            ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: _busy ? null : () => Navigator.pop(context),
        child: const Text('Fechar'),
      ),
    ],
  );
}
