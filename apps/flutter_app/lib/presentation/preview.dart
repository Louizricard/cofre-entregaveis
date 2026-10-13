import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/files_repository.dart';
import '../generated/api.g.dart';

class PreviewDialog extends ConsumerStatefulWidget {
  final String assetId;
  final String fileName;
  const PreviewDialog({
    super.key,
    required this.assetId,
    required this.fileName,
  });
  @override
  ConsumerState<PreviewDialog> createState() => _PreviewDialogState();
}

class _PreviewDialogState extends ConsumerState<PreviewDialog> {
  Timer? _timer;
  PreviewStateView? _status;
  PreviewView? _preview;
  String? _error;
  bool _loading = false;
  int _page = 1;
  FilesRepository get _repo => ref.read(filesRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }

  Future<void> _load({bool retry = false}) async {
    if (_loading) return;
    _timer?.cancel();
    setState(() {
      _loading = true;
      _error = null;
      _preview = null;
    });
    try {
      final status = retry
          ? await _repo.previewRetry(widget.assetId)
          : await _repo.previewStatus(widget.assetId);
      final preview = status.state == 'READY'
          ? await _repo.preview(widget.assetId, _page)
          : null;
      if (!mounted) return;
      setState(() {
        _status = status;
        _preview = preview;
      });
      if (['PENDING', 'RUNNING'].contains(status.state)) {
        _timer = Timer(const Duration(seconds: 5), () => _load());
      }
    } catch (_) {
      if (mounted)
        setState(
          () => _error = 'Não foi possível carregar a prévia. Tente novamente.',
        );
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('Prévia • ${widget.fileName}'),
    content: SizedBox(
      width: 680,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (_loading) const LinearProgressIndicator(),
            if (_error != null) Text(_error!),
            if (_status?.state == 'PENDING')
              const Text('Prévia na fila de processamento.'),
            if (_status?.state == 'RUNNING')
              Text(
                _status?.failureCode == null ? 'Preparando prévia. Aguarde…' : 'A geração falhou. Aguardando limpeza para tentar novamente.',
              ),
            if (_status?.state == 'FAILED')
              Text(
                _status?.failureCode == 'PREVIEW_QUOTA'
                    ? 'Não há espaço disponível para gerar esta prévia.'
                    : 'Não foi possível gerar a prévia. Você pode tentar novamente.',
              ),
            if (_status?.state == 'UNSUPPORTED')
              const Text(
                'A prévia automática está disponível para imagens e PDFs. Este formato ainda não tem prévia.',
              ),
            if (_preview != null) ...[
              Text('Página $_page de ${_preview!.pages}'),
              Image.network(
                _preview!.url,
                key: ValueKey(_preview!.url),
                fit: BoxFit.contain,
                errorBuilder: (_, _, _) => const Padding(
                  padding: EdgeInsets.all(24),
                  child: Text(
                    'A prévia expirou ou não carregou. Clique em Atualizar.',
                  ),
                ),
              ),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  IconButton(
                    tooltip: 'Página anterior',
                    onPressed: _loading || _page <= 1
                        ? null
                        : () {
                            _page--;
                            _load();
                          },
                    icon: const Icon(Icons.chevron_left),
                  ),
                  IconButton(
                    tooltip: 'Próxima página',
                    onPressed: _loading || _page >= _preview!.pages
                        ? null
                        : () {
                            _page++;
                            _load();
                          },
                    icon: const Icon(Icons.chevron_right),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    ),
    actions: [
      if (_status?.state == 'FAILED')
        TextButton(
          onPressed: _loading ? null : () => _load(retry: true),
          child: const Text('Reprocessar prévia'),
        ),
      TextButton(
        onPressed: _loading ? null : () => _load(),
        child: const Text('Atualizar'),
      ),
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Fechar'),
      ),
    ],
  );
}
