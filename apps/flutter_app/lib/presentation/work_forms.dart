import 'package:flutter/material.dart';

import '../application/work.dart';
import '../data/work_repository.dart';
import '../generated/api.g.dart';
import 'work_panel.dart';

String? validateWorkName(String? value) {
  final length = (value ?? '').trim().runes.length;
  return length < ClientDto.nameMinLength || length > ClientDto.nameMaxLength
      ? 'Use de 1 a 120 caracteres.'
      : null;
}

class ClientForm extends StatefulWidget {
  final WorkRepository repo;
  final ClientView? existing;
  const ClientForm({super.key, required this.repo, this.existing});
  @override
  State<ClientForm> createState() => _ClientFormState();
}

class _ClientFormState extends State<ClientForm> {
  final _form = GlobalKey<FormState>();
  late final _name = TextEditingController(text: widget.existing?.name);
  late final _email = TextEditingController(text: widget.existing?.email);
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.repo.saveClient(
        ClientDto(
          name: _name.text.trim(),
          email: _email.text.trim().toLowerCase(),
        ),
        existing: widget.existing,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted)
        setState(() {
          _error = workError(e);
          _busy = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AlertDialog(
      title: Text(widget.existing == null ? 'Novo cliente' : 'Editar cliente'),
      content: SizedBox(
        width: 440,
        child: SingleChildScrollView(
          child: Form(
            key: _form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                TextFormField(
                  controller: _name,
                  enabled: !_busy,
                  autofocus: true,
                  decoration: const InputDecoration(
                    labelText: 'Nome do cliente',
                  ),
                  textInputAction: TextInputAction.next,
                  validator: validateWorkName,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _email,
                  enabled: !_busy,
                  decoration: const InputDecoration(
                    labelText: 'E-mail do cliente',
                  ),
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _save(),
                  validator: (value) =>
                      (value ?? '').trim().runes.length >
                              ClientDto.emailMaxLength ||
                          !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                              .hasMatch((value ?? '').trim())
                      ? 'Informe um e-mail válido.'
                      : null,
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'Salvando…' : 'Salvar cliente'),
        ),
      ],
    ),
  );
}

class ProjectForm extends StatefulWidget {
  final WorkRepository repo;
  final ProjectView? existing;
  const ProjectForm({super.key, required this.repo, this.existing});
  @override
  State<ProjectForm> createState() => _ProjectFormState();
}

class _ProjectFormState extends State<ProjectForm> {
  final _form = GlobalKey<FormState>();
  late final _title = TextEditingController(text: widget.existing?.title);
  late final _balance = TextEditingController(
    text: brlInput(widget.existing?.balanceCents ?? 0),
  );
  late final _rounds = TextEditingController(
    text: (widget.existing?.includedRevisionRounds ?? 0).toString(),
  );
  late ClientView? _client = widget.existing?.client;
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _title.dispose();
    _balance.dispose();
    _rounds.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_busy || !_form.currentState!.validate()) return;
    if (_client == null) {
      setState(() => _error = 'Selecione um cliente.');
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.repo.saveProject(
        ProjectDto(
          clientId: _client!.id,
          title: _title.text.trim(),
          balanceCents: parseBrlCents(_balance.text)!,
          includedRevisionRounds: int.parse(_rounds.text.trim()),
        ),
        existing: widget.existing,
      );
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted)
        setState(() {
          _error = workError(e);
          _busy = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AlertDialog(
      title: Text(widget.existing == null ? 'Novo projeto' : 'Editar projeto'),
      content: SizedBox(
        width: 480,
        child: SingleChildScrollView(
          child: Form(
            key: _form,
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextFormField(
                  controller: _title,
                  enabled: !_busy,
                  autofocus: true,
                  decoration: const InputDecoration(
                    labelText: 'Título do projeto',
                  ),
                  textInputAction: TextInputAction.next,
                  validator: validateWorkName,
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  icon: const Icon(Icons.person_outline),
                  onPressed: _busy
                      ? null
                      : () async {
                          final client = await showDialog<ClientView>(
                            context: context,
                            builder: (_) => ClientPicker(repo: widget.repo),
                          );
                          if (client != null && mounted)
                            setState(() => _client = client);
                        },
                  label: Text(
                    _client == null
                        ? 'Selecionar cliente'
                        : 'Cliente: ${_client!.name}',
                  ),
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _balance,
                  enabled: !_busy,
                  decoration: const InputDecoration(
                    labelText: 'Saldo em reais (BRL)',
                    helperText: 'Ex.: 1500,50 • sem separador de milhar',
                  ),
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  textInputAction: TextInputAction.next,
                  validator: (value) => parseBrlCents(value ?? '') == null
                      ? 'Use um valor entre 0 e 21474836,47.'
                      : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _rounds,
                  enabled: !_busy,
                  decoration: const InputDecoration(
                    labelText: 'Revisões incluídas',
                  ),
                  keyboardType: TextInputType.number,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _save(),
                  validator: (value) {
                    final n = int.tryParse((value ?? '').trim());
                    return n == null ||
                            n < ProjectDto.includedRevisionRoundsMinimum ||
                            n > ProjectDto.includedRevisionRoundsMaximum
                        ? 'Use um inteiro entre 0 e 1000.'
                        : null;
                  },
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: Semantics(
                      liveRegion: true,
                      child: Text(
                        _error!,
                        style: TextStyle(
                          color: Theme.of(context).colorScheme.error,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
      actions: [
        TextButton(
          onPressed: _busy ? null : () => Navigator.pop(context),
          child: const Text('Cancelar'),
        ),
        FilledButton(
          onPressed: _busy ? null : _save,
          child: Text(_busy ? 'Salvando…' : 'Salvar projeto'),
        ),
      ],
    ),
  );
}
