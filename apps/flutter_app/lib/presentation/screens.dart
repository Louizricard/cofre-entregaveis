import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../application/session.dart';
import 'work_panel.dart';
import '../data/auth_repository.dart';
import '../generated/api.g.dart';

class SplashScreen extends ConsumerWidget {
  const SplashScreen({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final session = ref.watch(sessionProvider);
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: session.phase == SessionPhase.failed
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Text(session.error!, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    FilledButton(
                      onPressed: () =>
                          ref.read(sessionProvider.notifier).restore(),
                      child: const Text('Tentar novamente'),
                    ),
                  ],
                )
              : const Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    CircularProgressIndicator(
                      semanticsLabel: 'Verificando sessão',
                    ),
                    SizedBox(height: 24),
                    Text('Abrindo seu cofre…'),
                  ],
                ),
        ),
      ),
    );
  }
}

class AuthScreen extends ConsumerStatefulWidget {
  final bool register;
  const AuthScreen({super.key, required this.register});
  @override
  ConsumerState<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends ConsumerState<AuthScreen> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _workspace = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;
  bool _hidden = true;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _workspace.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final session = ref.read(sessionProvider.notifier);
      if (widget.register) {
        await session.register(
          RegisterDto(
            name: _name.text.trim(),
            workspaceName: _workspace.text.trim(),
            email: _email.text.trim().toLowerCase(),
            password: _password.text,
          ),
        );
      } else {
        await session.login(
          LoginDto(
            email: _email.text.trim().toLowerCase(),
            password: _password.text,
          ),
        );
      }
      TextInput.finishAutofillContext();
    } on ApiFailure catch (e) {
      if (mounted)
        setState(() {
          _error = e.message;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          _error = 'Não foi possível continuar. Tente novamente.';
        });
    } finally {
      if (mounted)
        setState(() {
          _busy = false;
        });
    }
  }

  String? _validateName(String? value) {
    final length = (value ?? '').trim().runes.length;
    return length < RegisterDto.nameMinLength ||
            length > RegisterDto.nameMaxLength
        ? 'Use de 1 a 120 caracteres.'
        : null;
  }

  @override
  Widget build(BuildContext context) {
    final register = widget.register;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: AutofillGroup(
                child: Form(
                  key: _form,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Align(
                        alignment: Alignment.centerLeft,
                        child: Icon(Icons.lock_outline, size: 36),
                      ),
                      const SizedBox(height: 16),
                      Text(
                        'Cofre de Entregáveis',
                        style: Theme.of(context).textTheme.titleMedium,
                      ),
                      const SizedBox(height: 32),
                      Text(
                        register
                            ? 'Seu trabalho começa aqui.'
                            : 'Seu espaço, de volta.',
                        style: Theme.of(context).textTheme.headlineMedium,
                      ),
                      const SizedBox(height: 12),
                      Text(
                        register
                            ? 'Crie sua conta e seu workspace pessoal.'
                            : 'Entre para acessar seu workspace.',
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: 28),
                      if (register) ...[
                        TextFormField(
                          controller: _name,
                          enabled: !_busy,
                          decoration: const InputDecoration(
                            labelText: 'Seu nome',
                          ),
                          autofillHints: const [AutofillHints.name],
                          textInputAction: TextInputAction.next,
                          validator: _validateName,
                        ),
                        const SizedBox(height: 18),
                        TextFormField(
                          controller: _workspace,
                          enabled: !_busy,
                          decoration: const InputDecoration(
                            labelText: 'Nome do workspace',
                          ),
                          textInputAction: TextInputAction.next,
                          validator: _validateName,
                        ),
                        const SizedBox(height: 18),
                      ],
                      TextFormField(
                        controller: _email,
                        enabled: !_busy,
                        decoration: const InputDecoration(labelText: 'E-mail'),
                        keyboardType: TextInputType.emailAddress,
                        autofillHints: const [AutofillHints.email],
                        textInputAction: TextInputAction.next,
                        validator: (value) {
                          final email = (value ?? '').trim();
                          return email.runes.length > LoginDto.emailMaxLength ||
                                  !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                                      .hasMatch(email)
                              ? 'Informe um e-mail válido.'
                              : null;
                        },
                      ),
                      const SizedBox(height: 18),
                      TextFormField(
                        controller: _password,
                        enabled: !_busy,
                        obscureText: _hidden,
                        enableSuggestions: false,
                        autocorrect: false,
                        autofillHints: [
                          register
                              ? AutofillHints.newPassword
                              : AutofillHints.password,
                        ],
                        decoration: InputDecoration(
                          labelText: 'Senha',
                          helperText: 'De 12 a 128 caracteres',
                          suffixIcon: IconButton(
                            tooltip: _hidden
                                ? 'Mostrar senha'
                                : 'Ocultar senha',
                            onPressed: () => setState(() {
                              _hidden = !_hidden;
                            }),
                            icon: Icon(
                              _hidden
                                  ? Icons.visibility_outlined
                                  : Icons.visibility_off_outlined,
                            ),
                          ),
                        ),
                        textInputAction: TextInputAction.done,
                        onFieldSubmitted: (_) => _submit(),
                        validator: (value) {
                          final length = (value ?? '').runes.length;
                          return length < LoginDto.passwordMinLength ||
                                  length > LoginDto.passwordMaxLength
                              ? 'Use de 12 a 128 caracteres.'
                              : null;
                        },
                      ),
                      const SizedBox(height: 24),
                      if (_error != null) ...[
                        Semantics(
                          liveRegion: true,
                          child: Text(
                            _error!,
                            style: TextStyle(
                              color: Theme.of(context).colorScheme.error,
                            ),
                          ),
                        ),
                        const SizedBox(height: 16),
                      ],
                      FilledButton(
                        onPressed: _busy ? null : _submit,
                        child: _busy
                            ? const SizedBox(
                                width: 22,
                                height: 22,
                                child: CircularProgressIndicator(
                                  strokeWidth: 2,
                                  semanticsLabel: 'Enviando',
                                ),
                              )
                            : Text(register ? 'Criar conta' : 'Entrar'),
                      ),
                      const SizedBox(height: 16),
                      TextButton(
                        onPressed: _busy
                            ? null
                            : () =>
                                  context.go(register ? '/login' : '/cadastro'),
                        child: Text(
                          register
                              ? 'Já tenho conta. Entrar'
                              : 'Criar uma conta',
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class DashboardScreen extends ConsumerStatefulWidget {
  const DashboardScreen({super.key});
  @override
  ConsumerState<DashboardScreen> createState() => _DashboardScreenState();
}

class _DashboardScreenState extends ConsumerState<DashboardScreen> {
  bool _busy = false;
  String? _error;

  Future<void> _logout() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await ref.read(sessionProvider.notifier).logout();
    } on ApiFailure catch (e) {
      if (mounted)
        setState(() {
          _error = e.message;
        });
    } catch (_) {
      if (mounted)
        setState(() {
          _error = 'Não foi possível sair. Tente novamente.';
        });
    } finally {
      if (mounted)
        setState(() {
          _busy = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final identity = ref.watch(sessionProvider).identity;
    if (identity == null) return const SplashScreen();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Cofre de Entregáveis'),
        actions: [
          TextButton(
            onPressed: _busy ? null : _logout,
            child: Text(_busy ? 'Saindo…' : 'Sair'),
          ),
          const SizedBox(width: 8),
        ],
      ),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 1120),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const SizedBox(height: 24),
                  Text(
                    identity.workspace.name,
                    style: Theme.of(context).textTheme.headlineMedium,
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Olá, ${identity.user.name}. Este é seu espaço de trabalho.',
                  ),
                  const SizedBox(height: 32),
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
                  WorkPanel(key: ValueKey(identity.workspace.id)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
