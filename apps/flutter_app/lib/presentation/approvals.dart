import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/approvals_repository.dart';
import '../data/auth_repository.dart';
import '../data/comments_repository.dart';
import '../generated/api.g.dart';

class ApprovalDialog extends ConsumerStatefulWidget {
  final String versionId;
  final bool guest;
  const ApprovalDialog({
    super.key,
    required this.versionId,
    required this.guest,
  });
  @override
  ConsumerState<ApprovalDialog> createState() => _ApprovalDialogState();
}

class _ApprovalDialogState extends ConsumerState<ApprovalDialog> {
  ApprovalStatusView? _status;
  String? _error;
  bool _busy = true;
  bool _confirmed = false;
  late final String _key = newCommentRequestId();
  ApprovalsRepository get _repo => ref.read(approvalsRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _load();
  }

  String message(Object e) => e is ApiFailure
      ? e.message
      : 'Não foi possível concluir. Tente novamente.';
  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
      _confirmed = false;
    });
    try {
      final status = await _repo.status(widget.versionId, guest: widget.guest);
      if (mounted) setState(() => _status = status);
    } catch (e) {
      if (mounted)
        setState(() {
          _error = message(e);
          _status = null;
        });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _approve() async {
    if (!_confirmed || _status?.canApprove != true) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final approval = await _repo.approve(widget.versionId, _key);
      final old = _status!;
      if (mounted)
        setState(
          () => _status = ApprovalStatusView(
            versionId: old.versionId,
            versionNumber: old.versionNumber,
            versionState: old.versionState,
            approval: approval,
            canApprove: false,
            reason: null,
          ),
        );
    } catch (e) {
      if (mounted) setState(() => _error = message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = _status;
    final approval = status?.approval;
    return AlertDialog(
      title: const Text('Aprovação da versão'),
      content: SizedBox(
        width: 520,
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
                    style: TextStyle(
                      color: Theme.of(context).colorScheme.error,
                    ),
                  ),
                ),
              if (status != null) ...[
                Text(
                  'V${status.versionNumber} • ${status.versionState == 'SUPERSEDED'
                      ? 'Histórico'
                      : status.versionState == 'PUBLISHED'
                      ? 'Atual'
                      : 'Rascunho'}',
                ),
                const SizedBox(height: 12),
                if (approval != null) ...[
                  const Text('Versão aprovada pelo cliente confirmado.'),
                  Text('Aprovada em ${approvalDateLabel(approval.approvedAt)}'),
                  if (status.versionState == 'SUPERSEDED')
                    const Text(
                      'Esta aprovação pertence somente à versão anterior. Confira a versão atual.',
                    ),
                ] else ...[
                  const Text('Esta versão ainda não foi aprovada.'),
                  if (status.reason != null) Text(status.reason!),
                ],
                if (widget.guest && status.canApprove) ...[
                  const SizedBox(height: 12),
                  const Text(
                    'Revise os arquivos antes de confirmar. A aprovação encerra os comentários e pedidos de ajustes desta versão. Uma nova versão precisará de outra aprovação.',
                  ),
                  CheckboxListTile(
                    contentPadding: EdgeInsets.zero,
                    value: _confirmed,
                    onChanged: _busy
                        ? null
                        : (value) =>
                              setState(() => _confirmed = value ?? false),
                    title: Text(
                      'Revisei os arquivos e aprovo a versão V${status.versionNumber}.',
                    ),
                  ),
                  FilledButton(
                    onPressed: _busy || !_confirmed ? null : _approve,
                    child: const Text('Confirmar aprovação'),
                  ),
                ],
                const SizedBox(height: 12),
                const Text(
                  'Os originais permanecem protegidos.',
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

String approvalDateLabel(String raw) {
  final value = DateTime.tryParse(raw)?.toLocal();
  if (value == null) return raw;
  String pad(int n) => n.toString().padLeft(2, '0');
  return '${pad(value.day)}/${pad(value.month)}/${value.year} às ${pad(value.hour)}:${pad(value.minute)}';
}
