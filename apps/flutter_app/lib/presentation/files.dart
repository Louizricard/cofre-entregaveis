import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../data/files_repository.dart';
import '../data/upload_file.dart';
import '../generated/api.g.dart';
import 'preview.dart';
import 'manual_preview.dart';

final uploadFilePickerProvider = Provider<Future<UploadFile?> Function()>(
  (ref) => pickUploadFile,
);
final downloadOpenerProvider = Provider<void Function(String)>(
  (ref) => openFileDownload,
);

String byteLabel(String raw) {
  final n = int.tryParse(raw) ?? 0;
  if (n < 1024) return '$n B';
  if (n < 1024 * 1024) return '${(n / 1024).toStringAsFixed(1)} KiB';
  if (n < 1024 * 1024 * 1024)
    return '${(n / (1024 * 1024)).toStringAsFixed(1)} MiB';
  return '${(n / (1024 * 1024 * 1024)).toStringAsFixed(2)} GiB';
}

String fileStatus(String s) =>
    const {
      'INITIATING': 'Preparando envio',
      'UPLOADING': 'Envio incompleto',
      'COMPLETING': 'Concluindo envio',
      'VALIDATING': 'Validando arquivo',
      'READY': 'Original disponível',
      'ABORTING': 'Cancelamento pendente',
      'ABORTED': 'Envio cancelado',
      'FAILED': 'Envio rejeitado ou expirado',
    }[s] ??
    s;

class FilesPanel extends ConsumerStatefulWidget {
  final String projectId;
  final bool active;
  final void Function(bool) onBusy;
  const FilesPanel({
    super.key,
    required this.projectId,
    required this.active,
    required this.onBusy,
  });
  @override
  ConsumerState<FilesPanel> createState() => _FilesPanelState();
}

class _FilesPanelState extends ConsumerState<FilesPanel> {
  List<VersionView> _versions = [];
  String? _cursor;
  String? _selected;
  StorageView? _storage;
  bool _loading = true;
  bool _busy = false;
  bool _retryMore = false;
  bool _cancelled = false;
  bool _completing = false;
  String? _error;
  String? _notice;
  double _progress = 0;
  UploadFile? _file;
  UploadView? _upload;
  final _parts = <PartDto>[];
  FilesRepository get _repo => ref.read(filesRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _file?.cancel();
    super.dispose();
  }

  void _setBusy(bool value) {
    if (!mounted) return;
    setState(() {
      _busy = value;
    });
    // Parent controls close/archive while an external operation is in flight.
    Future.microtask(() {
      if (mounted) widget.onBusy(value);
    });
  }

  String _message(Object e) => e is ApiFailure
      ? e.message
      : 'Não foi possível acessar os arquivos. Tente novamente.';
  Future<void> _load({bool more = false}) async {
    setState(() {
      _loading = true;
      _error = null;
      _retryMore = more;
    });
    try {
      final storage = await _repo.storage();
      final page = await _repo.versions(
        widget.projectId,
        cursor: more ? _cursor : null,
      );
      if (!mounted) return;
      setState(() {
        _storage = storage;
        final byId = {
          for (final v in [
            ...(more ? _versions : <VersionView>[]),
            ...page.items,
          ])
            v.id: v,
        };
        _versions = byId.values.toList()
          ..sort((a, b) => a.number.compareTo(b.number));
        _cursor = page.nextCursor;
        if (!_versions.any((v) => v.id == _selected))
          _selected = _versions.isEmpty ? null : _versions.last.id;
      });
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
        });
    } finally {
      if (mounted)
        setState(() {
          _loading = false;
        });
    }
  }

  Future<void> _version() async {
    _setBusy(true);
    setState(() {
      _error = null;
    });
    try {
      final version = await _repo.createVersion(widget.projectId);
      if (mounted)
        setState(() {
          _versions.add(version);
          _selected = version.id;
          _notice = 'Versão V${version.number} criada.';
        });
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
        });
    } finally {
      _setBusy(false);
    }
  }

  Future<void> _pick() async {
    _setBusy(true);
    setState(() {
      _error = null;
      _notice = null;
    });
    try {
      final file = await ref.read(uploadFilePickerProvider)();
      if (!mounted || file == null) return;
      if (file.mime.isEmpty ||
          file.size < 1 ||
          file.size > int.parse(_storage!.maxFileBytes)) {
        setState(() {
          _error = 'Selecione PNG, JPEG, WebP, PDF, MP4, MP3, WAV ou ZIP, de até 2 GiB.';
        });
        return;
      }
      _file = file;
      _parts.clear();
      _upload = null;
      _progress = 0;
      _cancelled = false;
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
        });
    } finally {
      _setBusy(false);
    }
    if (mounted && _file != null) await _send();
  }

  Future<void> _send() async {
    final file = _file;
    if (file == null || _selected == null || _busy) return;
    _setBusy(true);
    setState(() {
      _error = null;
      _notice = null;
      _cancelled = false;
      _completing = false;
    });
    try {
      _upload ??= await _repo.start(
        _selected!,
        StartUploadDto(
          fileName: file.name,
          declaredMime: file.mime,
          sizeBytes: file.size.toString(),
        ),
      );
      final upload = _upload!;
      for (var i = _parts.length; i < upload.partCount; i++) {
        if (_cancelled) throw const UploadCancelled();
        final signed = await _repo.parts(upload.asset.id, [i + 1]);
        if (_cancelled) throw const UploadCancelled();
        final start = i * upload.partSizeBytes;
        final end = math.min(file.size, start + upload.partSizeBytes);
        final etag = await file.sendPart(signed.parts.single.url, start, end, (
          sent,
        ) {
          if (mounted)
            setState(() {
              _progress = (start + sent) / file.size;
            });
        });
        _parts.add(PartDto(partNumber: i + 1, etag: etag));
      }
      if (_cancelled) throw const UploadCancelled();
      setState(() {
        _completing = true;
        _progress = 1;
      });
      final asset = await _repo.complete(upload.asset.id, _parts);
      if (asset.status != 'READY')
        throw const ApiFailure(
          409,
          'O arquivo ainda não foi validado. Tente concluir novamente.',
        );
      _upload = null;
      _file = null;
      _parts.clear();
      if (mounted)
        setState(() {
          _notice = 'Arquivo enviado. Aguarde a análise de segurança e clique em Atualizar.';
        });
      await _load();
    } on UploadCancelled {
      await _cancelUpload();
    } catch (e) {
      if (_cancelled) {
        await _cancelUpload();
      } else {
        if (_upload != null) {
          try {
            final asset = await _repo.asset(_upload!.asset.id);
            if (['FAILED', 'ABORTED', 'ABORTING'].contains(asset.status)) {
              _upload = null;
              _file = null;
              _parts.clear();
            }
          } catch (_) {
            /* Keep upload id for an explicit retry/cancel. */
          }
        }
        if (mounted)
          setState(() {
            _error = e is ApiFailure
                ? e.message
                : 'O envio falhou. Confira a conexão e tente novamente.';
          });
      }
    } finally {
      if (mounted)
        setState(() {
          _completing = false;
        });
      _setBusy(false);
    }
  }

  Future<void> _cancelUpload() async {
    try {
      if (_upload != null) {
        final result = await _repo.abort(_upload!.asset.id);
        if (mounted)
          setState(() {
            _notice = result.status == 'ABORTING'
                ? 'Cancelamento pendente. A cota será liberada após a limpeza.'
                : 'Envio cancelado.';
          });
      }
      _upload = null;
      _file = null;
      _parts.clear();
      await _load();
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
        });
    }
  }

  Future<void> _abortAsset(AssetView a) async {
    _setBusy(true);
    setState(() {
      _error = null;
    });
    try {
      final result = await _repo.abort(a.id);
      if (_upload?.asset.id == a.id) {
        _upload = null;
        _file = null;
        _parts.clear();
      }
      if (mounted)
        setState(() {
          _notice = result.status == 'ABORTING'
              ? 'Limpeza pendente. Tente atualizar em instantes.'
              : 'Envio cancelado.';
        });
      await _load();
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
        });
    } finally {
      _setBusy(false);
    }
  }

  Future<void> _manualPreview(AssetView asset, List<AssetView> assets) async {
    final selected = await showDialog<String>(
      context: context,
      builder: (_) => ManualPreviewDialog(assets: assets),
    );
    if (!mounted || selected == null) return;
    _setBusy(true);
    setState(() => _error = null);
    try {
      if (selected.isEmpty) {
        await _repo.removeManualPreview(asset.id);
      } else {
        await _repo.manualPreview(asset.id, selected);
      }
      if (mounted)
        setState(
          () => _notice = selected.isEmpty
              ? 'Prévia manual removida. Os arquivos continuam nesta versão.'
              : 'Prévia manual vinculada. Clique em Ver prévia.',
        );
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      _setBusy(false);
    }
  }

  Future<void> _download(AssetView a) async {
    _setBusy(true);
    setState(() {
      _error = null;
    });
    try {
      final result = await _repo.download(a.id);
      if (mounted) ref.read(downloadOpenerProvider)(result.url);
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
        });
    } finally {
      _setBusy(false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final assets =
        _versions.where((v) => v.id == _selected).firstOrNull?.assets ??
        <AssetView>[];
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Divider(height: 32),
        Text(
          'Versões e arquivos privados',
          style: Theme.of(context).textTheme.titleMedium,
        ),
        const SizedBox(height: 8),
        if (_storage != null)
          Text(
            '${byteLabel(_storage!.usedBytes)} usados • ${byteLabel(_storage!.reservedBytes)} reservados de ${byteLabel(_storage!.quotaBytes)}',
          ),
        if (_storage?.enabled == false)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text(
              'O armazenamento ainda não foi configurado. As versões podem ser organizadas; o envio ficará disponível após a configuração.',
            ),
          ),
        if (_loading)
          const Padding(
            padding: EdgeInsets.all(16),
            child: Center(
              child: CircularProgressIndicator(
                semanticsLabel: 'Carregando arquivos',
              ),
            ),
          ),
        if (_error != null)
          Semantics(
            liveRegion: true,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(
                _error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error),
              ),
            ),
          ),
        if (!_loading && _error != null && _file == null)
          TextButton(
            onPressed: _busy ? null : () => _load(more: _retryMore),
            child: const Text('Atualizar arquivos'),
          ),
        if (_notice != null)
          Semantics(
            liveRegion: true,
            child: Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: Text(_notice!),
            ),
          ),
        if (_versions.isNotEmpty)
          DropdownButtonFormField<String>(
            key: ValueKey(_selected),
            initialValue: _selected,
            isExpanded: true,
            decoration: const InputDecoration(labelText: 'Versão'),
            items: _versions
                .map(
                  (v) => DropdownMenuItem(
                    value: v.id,
                    child: Text('V${v.number} • Rascunho'),
                  ),
                )
                .toList(),
            onChanged: _busy || _file != null || _loading
                ? null
                : (v) => setState(() {
                    _selected = v;
                    _error = null;
                  }),
          ),
        if (!_loading && _versions.isEmpty)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 12),
            child: Text('Crie a primeira versão para organizar os arquivos.'),
          ),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: [
            if (widget.active)
              OutlinedButton(
                onPressed: _busy || _loading || _file != null ? null : _version,
                child: const Text('Nova versão'),
              ),
            if (widget.active && _selected != null)
              FilledButton.icon(
                onPressed:
                    _busy ||
                        _loading ||
                        _storage?.enabled != true ||
                        _file != null
                    ? null
                    : _pick,
                icon: const Icon(Icons.upload_file),
                label: const Text('Enviar arquivo'),
              ),
            TextButton(
              onPressed: _busy || _loading ? null : () => _load(),
              child: const Text('Atualizar'),
            ),
            if (_cursor != null)
              TextButton(
                onPressed: _busy || _loading ? null : () => _load(more: true),
                child: const Text('Carregar mais versões'),
              ),
          ],
        ),
        if (_file != null) ...[
          const SizedBox(height: 12),
          Text(_file!.name),
          LinearProgressIndicator(
            value: _completing ? null : _progress,
            semanticsLabel: _completing
                ? 'Validando arquivo'
                : 'Enviando arquivo',
          ),
          Text(
            _completing
                ? 'Concluindo e validando…'
                : '${(_progress * 100).round()}% enviado',
          ),
          Wrap(
            spacing: 8,
            children: [
              if (!_busy)
                TextButton(
                  onPressed: _send,
                  child: const Text('Tentar novamente'),
                ),
              if (!_completing)
                TextButton(
                  onPressed: () async {
                    if (_busy) {
                      _cancelled = true;
                      _file?.cancel();
                    } else {
                      _setBusy(true);
                      await _cancelUpload();
                      _setBusy(false);
                    }
                  },
                  child: const Text('Cancelar envio'),
                ),
            ],
          ),
        ],
        if (!_loading && _selected != null && assets.isEmpty)
          const Padding(
            padding: EdgeInsets.all(8),
            child: Text('Nenhum arquivo nesta versão.'),
          ),
        ...assets.map(
          (a) => Card(
            child: Padding(
              padding: const EdgeInsets.all(12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    a.fileName,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                  Text(
                    '${byteLabel(a.sizeBytes)} • ${a.status == 'READY' && a.scanStatus != 'CLEAN' ? const {'REJECTED': 'Bloqueado pela análise de segurança', 'ERROR': 'Análise de segurança indisponível', 'PENDING': 'Análise de segurança pendente', 'RUNNING': 'Analisando segurança…'}[a.scanStatus] ?? 'Análise de segurança pendente' : fileStatus(a.status)}',
                  ),
                  if (a.failureCode != null)
                    const Text(
                      'Selecione o arquivo novamente para iniciar um novo envio.',
                    ),
                  Wrap(
                    spacing: 8,
                    children: [
                      if (a.status == 'READY' &&
                          a.scanStatus == 'CLEAN' &&
                          widget.active)
                        TextButton.icon(
                          onPressed: _busy
                              ? null
                              : () => showDialog<void>(
                                  context: context,
                                  builder: (_) => PreviewDialog(
                                    assetId: a.id,
                                    fileName: a.fileName,
                                  ),
                                ),
                          icon: const Icon(Icons.visibility),
                          label: const Text('Ver prévia'),
                        ),
                      if (a.status == 'READY' &&
                          a.scanStatus == 'CLEAN' &&
                          a.mime == 'application/zip' &&
                          widget.active)
                        TextButton.icon(
                          onPressed: _busy
                              ? null
                              : () => _manualPreview(a, assets),
                          icon: const Icon(Icons.attach_file),
                          label: const Text('Escolher prévia manual'),
                        ),
                      if (a.status == 'READY' &&
                          a.scanStatus == 'CLEAN' &&
                          widget.active)
                        TextButton.icon(
                          onPressed: _busy ? null : () => _download(a),
                          icon: const Icon(Icons.download),
                          label: const Text('Baixar original'),
                        ),
                      if (a.status == 'READY' &&
                          a.scanStatus == 'ERROR' &&
                          widget.active)
                        TextButton(
                          onPressed: _busy
                              ? null
                              : () async {
                                  _setBusy(true);
                                  try {
                                    await _repo.retryScan(a.id);
                                    await _load();
                                  } catch (e) {
                                    if (mounted)
                                      setState(() => _error = _message(e));
                                  } finally {
                                    _setBusy(false);
                                  }
                                },
                          child: const Text('Repetir análise de segurança'),
                        ),
                      if (!['READY', 'FAILED', 'ABORTED'].contains(a.status))
                        TextButton(
                          onPressed: _busy || _storage?.enabled != true
                              ? null
                              : () => _abortAsset(a),
                          child: const Text('Cancelar envio pendente'),
                        ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }
}
