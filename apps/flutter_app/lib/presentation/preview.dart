import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/files_repository.dart';
import '../generated/api.g.dart';
import 'private_media.dart';

class PreviewDialog extends ConsumerStatefulWidget {
  final String assetId;
  final String fileName;
  final bool canRetry;
  final Future<PreviewStateView> Function()? loadStatus;
  final Future<PreviewView> Function(int)? loadPreview;
  const PreviewDialog({
    super.key,
    required this.assetId,
    required this.fileName,
    this.canRetry = true,
    this.loadStatus,
    this.loadPreview,
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
          : await (widget.loadStatus?.call() ??
                _repo.previewStatus(widget.assetId));
      final preview = status.state == 'READY'
          ? await (widget.loadPreview?.call(_page) ??
                _repo.preview(widget.assetId, _page))
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
              Text(
                _status?.failureCode == 'SECURITY_SCAN_REQUIRED'
                    ? 'Aguarde a análise de segurança antes de visualizar.'
                    : 'Prévia na fila de processamento.',
              ),
            if (_status?.state == 'RUNNING')
              Text(
                _status?.failureCode == null ? 'Preparando prévia. Aguarde…' : 'A geração falhou. Aguardando limpeza para tentar novamente.',
              ),
            if (_status?.state == 'FAILED')
              Text(
                _status?.failureCode == 'SECURITY_REJECTED'
                    ? 'Arquivo bloqueado pela análise de segurança.'
                    : _status?.failureCode == 'SECURITY_SCAN_ERROR'
                    ? widget.canRetry
                          ? 'A análise de segurança falhou. Feche esta janela e repita a análise no arquivo.'
                          : 'Prévia indisponível. Entre em contato com o responsável.'
                    : _status?.failureCode == 'PREVIEW_QUOTA'
                    ? 'Não há espaço disponível para gerar esta prévia.'
                    : widget.canRetry
                    ? 'Não foi possível gerar a prévia. Você pode tentar novamente.'
                    : 'Prévia indisponível. Entre em contato com o responsável.',
              ),
            if (_status?.state == 'UNSUPPORTED')
              const Text('Este formato ainda não tem prévia automática.'),
            if (_preview != null && _preview!.kind != 'IMAGE') ...[
              const Text('Trecho de prévia • até 60 segundos'),
              PrivateMedia(
                key: ValueKey(_preview!.url),
                url: _preview!.url,
                audio: _preview!.kind == 'AUDIO',
              ),
            ],
            if (_preview != null && _preview!.kind == 'IMAGE') ...[
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
      if (widget.canRetry &&
          _status?.state == 'FAILED' &&
          !(_status?.failureCode?.startsWith('SECURITY') ?? false))
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
