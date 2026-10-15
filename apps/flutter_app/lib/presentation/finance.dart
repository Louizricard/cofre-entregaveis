import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/finance_repository.dart';
import '../data/auth_repository.dart';
import '../data/comments_repository.dart';
import '../generated/api.g.dart';
import 'files.dart';

String financeMoney(int cents) =>
    'R\$ ${(cents / 100).toStringAsFixed(2).replaceAll('.', ',')}';
String financeLabel(String state) => switch (state) {
  'PAID' => 'Pagamento externo registrado',
  'WAIVED' => 'Cobrança dispensada',
  'REVERSED' => 'Quitação desfeita',
  _ => 'Aguardando quitação',
};
String actionLabel(String kind) => switch (kind) {
  'EXTERNAL_PAYMENT' => 'Registrar pagamento recebido',
  'WAIVER' => 'Dispensar cobrança',
  _ => 'Desfazer quitação',
};
String financeError(Object e) => e is ApiFailure
    ? e.message
    : 'Não foi possível concluir. Atualize ou tente novamente.';

class FinanceDialog extends ConsumerStatefulWidget {
  final String projectId;
  const FinanceDialog({super.key, required this.projectId});
  @override
  ConsumerState<FinanceDialog> createState() => _FinanceDialogState();
}

class _FinanceDialogState extends ConsumerState<FinanceDialog> {
  FinanceView? _view;
  final _reason = TextEditingController();
  bool _busy = true, _confirmed = false;
  String? _error, _key;
  String _kind = 'EXTERNAL_PAYMENT';
  ManualSettlementDto? _pending;
  FinanceRepository get _repo => ref.read(financeRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final view = await _repo.load(widget.projectId);
      if (mounted)
        setState(() {
          _view = view;
          _pending = null;
          _key = null;
          _confirmed = false;
          _reason.clear();
          _kind = view.canReverse
              ? 'REVERSAL'
              : view.invoice.amountCents == 0
              ? 'WAIVER'
              : 'EXTERNAL_PAYMENT';
        });
    } catch (e) {
      if (mounted)
        setState(() {
          _error = financeError(e);
          _view = null;
        });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _submit() async {
    if (_busy || !_confirmed || _view == null) return;
    if (_reason.text.trim().length < 5) {
      setState(() => _error = 'Informe um motivo com pelo menos 5 caracteres.');
      return;
    }
    _pending ??= ManualSettlementDto(
      invoiceId: _view!.invoice.id,
      expectedRevision: _view!.invoice.revision,
      kind: _kind,
      reason: _reason.text.trim(),
      confirmed: true,
    );
    _key ??= newCommentRequestId();
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await _repo.settle(widget.projectId, _pending!, _key!);
      if (mounted)
        setState(() {
          _view = result;
          _pending = null;
          _key = null;
          _confirmed = false;
          _reason.clear();
          _kind = result.canReverse
              ? 'REVERSAL'
              : result.invoice.amountCents == 0
              ? 'WAIVER'
              : 'EXTERNAL_PAYMENT';
        });
    } catch (e) {
      if (mounted) setState(() => _error = financeError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = _view;
    final editable = !_busy && _pending == null;
    final canAct = v != null && (v.canSettle || v.canReverse);
    return PopScope(
      canPop: !_busy,
      child: AlertDialog(
        title: const Text('Cobrança e quitação manual'),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (_busy) const LinearProgressIndicator(),
                if (_error != null)
                  Semantics(liveRegion: true, child: Text(_error!)),
                if (v != null) ...[
                  Text(
                    'Valor da cobrança: ${financeMoney(v.invoice.amountCents)}',
                  ),
                  Text(financeLabel(v.invoice.state)),
                  const SizedBox(height: 12),
                  const Text(
                    'O original exige aprovação da versão atual e análise de segurança válida. O pagamento é registrado manualmente pelo criador.',
                  ),
                  if (canAct) ...[
                    const SizedBox(height: 16),
                    DropdownButtonFormField<String>(
                      isExpanded: true,
                      key: ValueKey('${v.invoice.revision}:$_kind'),
                      initialValue: _kind,
                      decoration: const InputDecoration(labelText: 'Operação'),
                      items:
                          (v.canReverse
                                  ? ['REVERSAL']
                                  : [
                                      if (v.invoice.amountCents > 0)
                                        'EXTERNAL_PAYMENT',
                                      'WAIVER',
                                    ])
                              .map(
                                (k) => DropdownMenuItem(
                                  value: k,
                                  child: Text(actionLabel(k)),
                                ),
                              )
                              .toList(),
                      onChanged: editable
                          ? (value) => setState(() {
                              _kind = value!;
                              _confirmed = false;
                            })
                          : null,
                    ),
                    TextField(
                      controller: _reason,
                      enabled: editable,
                      maxLength: 1000,
                      minLines: 2,
                      maxLines: 4,
                      decoration: const InputDecoration(
                        labelText: 'Motivo / referência do recebimento',
                        helperText: 'Não inclua dados bancários sensíveis.',
                      ),
                    ),
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _confirmed,
                      onChanged: editable
                          ? (value) =>
                                setState(() => _confirmed = value ?? false)
                          : null,
                      title: Text(switch (_kind) {
                        'EXTERNAL_PAYMENT' =>
                          'Confirmo que recebi o valor integral fora do Cofre.',
                        'WAIVER' => 'Confirmo a dispensa desta cobrança pelo motivo informado.',
                        _ => 'Confirmo desfazer o registro. Isso não realiza reembolso bancário.',
                      }),
                    ),
                    FilledButton(
                      onPressed: !_busy && _confirmed ? _submit : null,
                      child: Text(
                        _pending == null
                            ? actionLabel(_kind)
                            : 'Repetir confirmação',
                      ),
                    ),
                  ],
                  const SizedBox(height: 20),
                  const Text('Histórico'),
                  if (v.history.isEmpty) const Text('Nenhum registro manual.'),
                  for (final event in v.history)
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(actionLabel(event.kind)),
                            Text(event.reason),
                            Text(
                              '${event.actorName} • ${DateTime.parse(event.createdAt).toLocal()}',
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
      ),
    );
  }
}

class GuestOriginalButton extends ConsumerStatefulWidget {
  final String assetId;
  const GuestOriginalButton({super.key, required this.assetId});
  @override
  ConsumerState<GuestOriginalButton> createState() =>
      _GuestOriginalButtonState();
}

class _GuestOriginalButtonState extends ConsumerState<GuestOriginalButton> {
  bool _busy = false;
  String? _error;
  Future<void> _download() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await ref
          .read(financeRepositoryProvider)
          .download(widget.assetId);
      if (mounted) ref.read(downloadOpenerProvider)(result.url);
    } catch (e) {
      if (mounted) setState(() => _error = financeError(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      TextButton.icon(
        onPressed: _busy ? null : _download,
        icon: const Icon(Icons.download),
        label: Text(_busy ? 'Preparando original…' : 'Baixar original'),
      ),
      if (_error != null) Semantics(liveRegion: true, child: Text(_error!)),
    ],
  );
}
