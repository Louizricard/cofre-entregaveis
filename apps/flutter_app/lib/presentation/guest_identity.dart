import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../data/sharing_repository.dart';
import '../generated/api.g.dart';

class GuestIdentityPanel extends ConsumerStatefulWidget {
  const GuestIdentityPanel({super.key});
  @override
  ConsumerState<GuestIdentityPanel> createState() => _GuestIdentityPanelState();
}

class _GuestIdentityPanelState extends ConsumerState<GuestIdentityPanel> {
  final _email = TextEditingController();
  final _code = TextEditingController();
  final _emailForm = GlobalKey<FormState>();
  final _codeForm = GlobalKey<FormState>();
  IdentityStatusView? _status;
  String? _error;
  String? _notice;
  bool _busy = true;
  bool _requested = false;
  int _remaining = 0;
  Timer? _timer;
  GuestRepository get _repo => ref.read(guestRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _email.dispose();
    _code.dispose();
    super.dispose();
  }

  String _message(Object e) => e is ApiFailure
      ? e.message
      : 'Não foi possível confirmar o e-mail. Tente novamente.';
  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final status = await _repo.identityStatus();
      if (mounted) setState(() => _status = status);
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _request() async {
    if (!_emailForm.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
      _notice = null;
    });
    try {
      final result = await _repo.requestIdentity(
        _email.text.trim().toLowerCase(),
      );
      if (!mounted) return;
      setState(() {
        _notice = result.message;
        _requested = true;
        _remaining = 60;
        _code.clear();
      });
      _timer?.cancel();
      _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
        if (!mounted || _remaining <= 1) {
          timer.cancel();
          if (mounted) setState(() => _remaining = 0);
        } else {
          setState(() => _remaining--);
        }
      });
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _verify() async {
    if (!_codeForm.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final status = await _repo.verifyIdentity(_code.text);
      if (mounted)
        setState(() {
          _status = status;
          _notice = null;
          _code.clear();
          _email.clear();
          _timer?.cancel();
        });
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
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
          if (_status == null && !_busy)
            TextButton(
              onPressed: _load,
              child: const Text('Atualizar confirmação'),
            ),
          if (_status?.verified == true)
            const Text('E-mail confirmado neste acesso.'),
          if (_status?.verified == false && _status?.enabled == false)
            const Text(
              'A confirmação por e-mail ainda não está disponível. Você pode continuar visualizando as prévias.',
            ),
          if (_status?.enabled == true && _status?.verified == false) ...[
            Text(
              'Confirme seu e-mail',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const Text(
              'Use o e-mail cadastrado neste projeto. A confirmação identifica você neste acesso.',
            ),
            const SizedBox(height: 12),
            Form(
              key: _emailForm,
              child: TextFormField(
                controller: _email,
                enabled: !_busy,
                maxLength: 254,
                keyboardType: TextInputType.emailAddress,
                autofillHints: const [AutofillHints.email],
                decoration: const InputDecoration(
                  labelText: 'E-mail do cliente',
                ),
                validator: (value) =>
                    RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                        .hasMatch(value?.trim() ?? '')
                    ? null
                    : 'Informe um e-mail válido.',
              ),
            ),
            OutlinedButton(
              onPressed: _busy || _remaining > 0 ? null : _request,
              child: Text(
                _remaining > 0
                    ? 'Solicitar novamente em $_remaining s'
                    : _requested
                    ? 'Solicitar outro código'
                    : 'Receber código',
              ),
            ),
            if (_notice != null)
              Semantics(liveRegion: true, child: Text(_notice!)),
            if (_requested) ...[
              const SizedBox(height: 12),
              Form(
                key: _codeForm,
                child: TextFormField(
                  controller: _code,
                  enabled: !_busy,
                  keyboardType: TextInputType.number,
                  autofillHints: const [AutofillHints.oneTimeCode],
                  inputFormatters: [
                    FilteringTextInputFormatter.digitsOnly,
                    LengthLimitingTextInputFormatter(6),
                  ],
                  decoration: const InputDecoration(
                    labelText: 'Código de 6 dígitos',
                  ),
                  validator: (value) => RegExp(r'^\d{6}$').hasMatch(value ?? '')
                      ? null
                      : 'Informe os seis dígitos do código.',
                ),
              ),
              FilledButton(
                onPressed: _busy ? null : _verify,
                child: const Text('Confirmar e-mail'),
              ),
            ],
          ],
        ],
      ),
    ),
  );
}
