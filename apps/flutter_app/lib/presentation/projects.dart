import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/session.dart';
import '../data/auth_repository.dart';
import '../generated/api.g.dart';
import 'files.dart';

String failureMessage(Object error) => error is ApiFailure
    ? error.message
    : 'Não foi possível concluir. Tente novamente.';

String money(int cents) {
  final whole = (cents ~/ 100).toString().replaceAllMapped(
    RegExp(r'(\d)(?=(\d{3})+$)'),
    (m) => '${m[1]}.',
  );
  return 'R\$ $whole,${(cents % 100).toString().padLeft(2, '0')}';
}

// Parse decimal input as integer cents, without rounding floating-point values.
int? parseCents(String text) {
  final value = text.trim();
  if (!RegExp(r'^\d+(?:,\d{1,2})?$').hasMatch(value)) return null;
  final parts = value.split(',');
  final whole = int.tryParse(parts[0]);
  if (whole == null || whole > CreateProjectDto.balanceCentsMaximum ~/ 100)
    return null;
  final cents =
      whole * 100 +
      (parts.length == 2 ? int.parse(parts[1].padRight(2, '0')) : 0);
  return cents <= CreateProjectDto.balanceCentsMaximum ? cents : null;
}

class FailureNotice extends StatelessWidget {
  final String message;
  final VoidCallback? retry;
  const FailureNotice(this.message, {super.key, this.retry});
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 12),
    child: Column(
      children: [
        Semantics(
          liveRegion: true,
          child: Text(
            message,
            style: TextStyle(color: Theme.of(context).colorScheme.error),
          ),
        ),
        if (retry != null)
          TextButton(onPressed: retry, child: const Text('Tentar novamente')),
      ],
    ),
  );
}

class WorkspaceContent extends ConsumerStatefulWidget {
  const WorkspaceContent({super.key});
  @override
  ConsumerState<WorkspaceContent> createState() => _WorkspaceContentState();
}

class _WorkspaceContentState extends ConsumerState<WorkspaceContent> {
  bool _clientsTab = false;
  String _status = 'ACTIVE';
  final _search = TextEditingController();
  String _appliedSearch = '';
  List<ProjectView> _projects = [];
  List<ClientView> _clients = [];
  String? _cursor;
  String? _error;
  bool _loading = true;
  bool _retryMore = false;
  int _request = 0;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false}) async {
    final request = ++_request;
    setState(() {
      _loading = true;
      _error = null;
      _retryMore = more;
    });
    try {
      final repo = ref.read(authRepositoryProvider);
      if (_clientsTab) {
        final page = await repo.clients(
          cursor: more ? _cursor : null,
          search: _appliedSearch,
        );
        if (!mounted || request != _request) return;
        setState(() {
          _clients = [...(more ? _clients : <ClientView>[]), ...page.items];
          _cursor = page.nextCursor;
        });
      } else {
        final page = await repo.projects(
          cursor: more ? _cursor : null,
          search: _appliedSearch,
          status: _status,
        );
        if (!mounted || request != _request) return;
        setState(() {
          _projects = [...(more ? _projects : <ProjectView>[]), ...page.items];
          _cursor = page.nextCursor;
        });
      }
    } catch (e) {
      if (mounted && request == _request)
        setState(() {
          _error = failureMessage(e);
        });
    } finally {
      if (mounted && request == _request)
        setState(() {
          _loading = false;
        });
    }
  }

  void _reset() {
    setState(() {
      _projects = [];
      _clients = [];
      _cursor = null;
    });
    _load();
  }

  Future<void> _newClient() async {
    final client = await showDialog<ClientView>(
      context: context,
      barrierDismissible: false,
      builder: (_) => ClientForm(repo: ref.read(authRepositoryProvider)),
    );
    if (!mounted || client == null) return;
    setState(() {
      _clientsTab = true;
      _search.clear();
      _appliedSearch = '';
    });
    _reset();
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Cliente cadastrado.')));
  }

  Future<void> _newProject() async {
    final project = await showDialog<ProjectView>(
      context: context,
      barrierDismissible: false,
      builder: (_) => ProjectForm(repo: ref.read(authRepositoryProvider)),
    );
    if (!mounted || project == null) return;
    setState(() {
      _clientsTab = false;
      _status = 'ACTIVE';
      _search.clear();
      _appliedSearch = '';
    });
    _reset();
    ScaffoldMessenger.of(context)
        .showSnackBar(const SnackBar(content: Text('Projeto criado.')));
  }

  Future<void> _details(ProjectView project) async {
    final changed = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => ProjectDetails(
        repo: ref.read(authRepositoryProvider),
        id: project.id,
      ),
    );
    if (mounted && changed == true) _reset();
  }

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Wrap(
        spacing: 12,
        runSpacing: 12,
        children: [
          FilledButton.icon(
            onPressed: _newProject,
            icon: const Icon(Icons.add),
            label: const Text('Novo projeto'),
          ),
          OutlinedButton.icon(
            onPressed: _newClient,
            icon: const Icon(Icons.person_add_outlined),
            label: const Text('Novo cliente'),
          ),
        ],
      ),
      const SizedBox(height: 24),
      Wrap(
        spacing: 12,
        children: [
          ChoiceChip(
            label: const Text('Projetos'),
            selected: !_clientsTab,
            onSelected: (_) {
              if (!_clientsTab) return;
              setState(() {
                _clientsTab = false;
                _search.clear();
                _appliedSearch = '';
              });
              _reset();
            },
          ),
          ChoiceChip(
            label: const Text('Clientes'),
            selected: _clientsTab,
            onSelected: (_) {
              if (_clientsTab) return;
              setState(() {
                _clientsTab = true;
                _search.clear();
                _appliedSearch = '';
              });
              _reset();
            },
          ),
        ],
      ),
      const SizedBox(height: 16),
      TextField(
        controller: _search,
        maxLength: 120,
        textInputAction: TextInputAction.search,
        onSubmitted: (_) {
          _appliedSearch = _search.text.trim();
          _reset();
        },
        decoration: InputDecoration(
          labelText: _clientsTab
              ? 'Buscar cliente por nome ou e-mail'
              : 'Buscar projeto por título',
          counterText: '',
          suffixIcon: IconButton(
            tooltip: 'Buscar',
            icon: const Icon(Icons.search),
            onPressed: () {
              _appliedSearch = _search.text.trim();
              _reset();
            },
          ),
        ),
      ),
      if (!_clientsTab)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Wrap(
            spacing: 12,
            children: [
              ChoiceChip(
                label: const Text('Ativos'),
                selected: _status == 'ACTIVE',
                onSelected: (_) {
                  setState(() {
                    _status = 'ACTIVE';
                  });
                  _reset();
                },
              ),
              ChoiceChip(
                label: const Text('Arquivados'),
                selected: _status == 'ARCHIVED',
                onSelected: (_) {
                  setState(() {
                    _status = 'ARCHIVED';
                  });
                  _reset();
                },
              ),
            ],
          ),
        ),
      if (_loading)
        const Padding(
          padding: EdgeInsets.all(20),
          child: Center(
            child: CircularProgressIndicator(
              semanticsLabel: 'Carregando registros',
            ),
          ),
        ),
      if (_error != null)
        FailureNotice(_error!, retry: () => _load(more: _retryMore)),
      if (!_loading &&
          _error == null &&
          (_clientsTab ? _clients.isEmpty : _projects.isEmpty))
        Card(
          child: Padding(
            padding: const EdgeInsets.all(32),
            child: Column(
              children: [
                Icon(
                  _clientsTab ? Icons.people_outline : Icons.folder_outlined,
                  size: 48,
                ),
                const SizedBox(height: 16),
                Text(
                  _appliedSearch.isNotEmpty
                      ? 'Nenhum resultado.'
                      : _clientsTab
                      ? 'Ainda não há clientes.'
                      : _status == 'ARCHIVED'
                      ? 'Nenhum projeto arquivado.'
                      : 'Um novo começo.',
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(
                  _appliedSearch.isNotEmpty
                      ? 'Tente outro termo de busca.'
                      : _clientsTab
                      ? 'Cadastre seu primeiro cliente para organizar as entregas.'
                      : _status == 'ARCHIVED'
                      ? 'Os projetos arquivados aparecerão aqui.'
                      : 'Cadastre um cliente e crie seu primeiro projeto.',
                  textAlign: TextAlign.center,
                ),
              ],
            ),
          ),
        ),
      if (_clientsTab)
        ..._clients.map(
          (client) => Card(
            child: ListTile(
              leading: const Icon(Icons.person_outline),
              title: Text(client.name),
              subtitle: Text(client.email),
            ),
          ),
        ),
      if (!_clientsTab)
        ..._projects.map(
          (project) => Card(
            child: ListTile(
              onTap: () => _details(project),
              title: Text(project.title),
              subtitle: Text(
                '${project.client.name}\n${money(project.balanceCents)} • ${project.includedRevisionRounds} revisões incluídas',
              ),
              isThreeLine: true,
              trailing: const Icon(Icons.chevron_right),
            ),
          ),
        ),
      if (_cursor != null && !_loading && _error == null)
        Padding(
          padding: const EdgeInsets.all(16),
          child: OutlinedButton(
            onPressed: () => _load(more: true),
            child: const Text('Carregar mais'),
          ),
        ),
    ],
  );
}

class ClientForm extends StatefulWidget {
  final AuthRepository repo;
  const ClientForm({super.key, required this.repo});
  @override
  State<ClientForm> createState() => _ClientFormState();
}

class _ClientFormState extends State<ClientForm> {
  final _form = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.repo.createClient(
        CreateClientDto(
          name: _name.text.trim(),
          email: _email.text.trim().toLowerCase(),
        ),
      );
      if (mounted) Navigator.pop(context, result);
    } catch (e) {
      if (mounted)
        setState(() {
          _error = failureMessage(e);
        });
    } finally {
      if (mounted)
        setState(() {
          _busy = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AlertDialog(
      title: const Text('Novo cliente'),
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
                  textInputAction: TextInputAction.next,
                  decoration: const InputDecoration(
                    labelText: 'Nome do cliente',
                  ),
                  maxLength: CreateClientDto.nameMaxLength,
                  validator: (v) => (v ?? '').trim().isEmpty
                      ? 'Informe o nome do cliente.'
                      : null,
                ),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _email,
                  enabled: !_busy,
                  keyboardType: TextInputType.emailAddress,
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  decoration: const InputDecoration(
                    labelText: 'E-mail do cliente',
                  ),
                  maxLength: CreateClientDto.emailMaxLength,
                  validator: (v) =>
                      !RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$')
                          .hasMatch((v ?? '').trim())
                      ? 'Informe um e-mail válido.'
                      : null,
                ),
                if (_error != null) FailureNotice(_error!),
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
          onPressed: _busy ? null : _submit,
          child: Text(_busy ? 'Salvando…' : 'Salvar cliente'),
        ),
      ],
    ),
  );
}

class ClientPicker extends StatefulWidget {
  final AuthRepository repo;
  const ClientPicker({super.key, required this.repo});
  @override
  State<ClientPicker> createState() => _ClientPickerState();
}

class _ClientPickerState extends State<ClientPicker> {
  final _search = TextEditingController();
  List<ClientView> _items = [];
  String? _cursor;
  String? _error;
  bool _busy = true;
  bool _retryMore = false;
  String _appliedSearch = '';
  int _request = 0;
  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false}) async {
    final request = ++_request;
    setState(() {
      _busy = true;
      _error = null;
      _retryMore = more;
    });
    try {
      final page = await widget.repo.clients(
        cursor: more ? _cursor : null,
        search: _appliedSearch,
      );
      if (!mounted || request != _request) return;
      setState(() {
        _items = [...(more ? _items : <ClientView>[]), ...page.items];
        _cursor = page.nextCursor;
      });
    } catch (e) {
      if (mounted && request == _request)
        setState(() {
          _error = failureMessage(e);
        });
    } finally {
      if (mounted && request == _request)
        setState(() {
          _busy = false;
        });
    }
  }

  void _find() {
    _appliedSearch = _search.text.trim();
    setState(() {
      _items = [];
      _cursor = null;
    });
    _load();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Selecionar cliente'),
    content: SizedBox(
      width: 440,
      height: 400,
      child: Column(
        children: [
          TextField(
            controller: _search,
            maxLength: 120,
            textInputAction: TextInputAction.search,
            onSubmitted: (_) => _find(),
            decoration: InputDecoration(
              labelText: 'Buscar nome ou e-mail',
              counterText: '',
              suffixIcon: IconButton(
                tooltip: 'Buscar clientes',
                onPressed: _find,
                icon: const Icon(Icons.search),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Expanded(
            child: ListView(
              children: [
                if (_busy)
                  const Center(
                    child: CircularProgressIndicator(
                      semanticsLabel: 'Carregando clientes',
                    ),
                  ),
                if (_error != null)
                  FailureNotice(_error!, retry: () => _load(more: _retryMore)),
                if (!_busy && _error == null && _items.isEmpty)
                  const Text(
                    'Nenhum cliente encontrado. Cadastre um novo cliente.',
                  ),
                ..._items.map(
                  (c) => ListTile(
                    title: Text(c.name),
                    subtitle: Text(c.email),
                    onTap: () => Navigator.pop(context, c),
                  ),
                ),
                if (_cursor != null && !_busy && _error == null)
                  TextButton(
                    onPressed: () => _load(more: true),
                    child: const Text('Carregar mais clientes'),
                  ),
              ],
            ),
          ),
        ],
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancelar'),
      ),
      TextButton(
        onPressed: () async {
          final client = await showDialog<ClientView>(
            context: context,
            barrierDismissible: false,
            builder: (_) => ClientForm(repo: widget.repo),
          );
          if (context.mounted && client != null) Navigator.pop(context, client);
        },
        child: const Text('Novo cliente'),
      ),
    ],
  );
}

class ProjectForm extends StatefulWidget {
  final AuthRepository repo;
  const ProjectForm({super.key, required this.repo});
  @override
  State<ProjectForm> createState() => _ProjectFormState();
}

class _ProjectFormState extends State<ProjectForm> {
  final _form = GlobalKey<FormState>();
  final _title = TextEditingController();
  final _balance = TextEditingController(text: '0,00');
  final _revisions = TextEditingController(text: '2');
  ClientView? _client;
  bool _busy = false;
  String? _error;
  @override
  void dispose() {
    _title.dispose();
    _balance.dispose();
    _revisions.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy || !_form.currentState!.validate()) return;
    if (_client == null) {
      setState(() {
        _error = 'Selecione um cliente.';
      });
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final result = await widget.repo.createProject(
        CreateProjectDto(
          clientId: _client!.id,
          title: _title.text.trim(),
          balanceCents: parseCents(_balance.text)!,
          includedRevisionRounds: int.parse(_revisions.text.trim()),
        ),
      );
      if (mounted) Navigator.pop(context, result);
    } catch (e) {
      if (mounted)
        setState(() {
          _error = failureMessage(e);
        });
    } finally {
      if (mounted)
        setState(() {
          _busy = false;
        });
    }
  }

  @override
  Widget build(BuildContext context) => PopScope(
    canPop: !_busy,
    child: AlertDialog(
      title: const Text('Novo projeto'),
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
                  maxLength: CreateProjectDto.titleMaxLength,
                  decoration: const InputDecoration(
                    labelText: 'Título do projeto',
                  ),
                  textInputAction: TextInputAction.next,
                  validator: (v) =>
                      (v ?? '').trim().isEmpty ? 'Informe o título.' : null,
                ),
                const SizedBox(height: 12),
                OutlinedButton.icon(
                  icon: const Icon(Icons.person_outline),
                  label: Text(
                    _client == null
                        ? 'Selecionar cliente'
                        : 'Cliente: ${_client!.name}',
                  ),
                  onPressed: _busy
                      ? null
                      : () async {
                          final client = await showDialog<ClientView>(
                            context: context,
                            builder: (_) => ClientPicker(repo: widget.repo),
                          );
                          if (mounted && client != null)
                            setState(() {
                              _client = client;
                              _error = null;
                            });
                        },
                ),
                const SizedBox(height: 20),
                TextFormField(
                  controller: _balance,
                  enabled: !_busy,
                  keyboardType: const TextInputType.numberWithOptions(
                    decimal: true,
                  ),
                  decoration: const InputDecoration(
                    labelText: 'Saldo a receber (R\$)',
                    helperText: 'Ex.: 1500,50 • zero se não houver saldo',
                  ),
                  textInputAction: TextInputAction.next,
                  validator: (v) => parseCents(v ?? '') == null
                      ? 'Use de 0,00 a 21474836,47, sem pontos.'
                      : null,
                ),
                const SizedBox(height: 20),
                TextFormField(
                  controller: _revisions,
                  enabled: !_busy,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Revisões incluídas',
                  ),
                  textInputAction: TextInputAction.done,
                  onFieldSubmitted: (_) => _submit(),
                  validator: (v) {
                    final n = int.tryParse((v ?? '').trim());
                    return n == null ||
                            n < 0 ||
                            n > CreateProjectDto.includedRevisionRoundsMaximum
                        ? 'Use um número inteiro de 0 a 1000.'
                        : null;
                  },
                ),
                if (_error != null) FailureNotice(_error!),
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
          onPressed: _busy ? null : _submit,
          child: Text(_busy ? 'Salvando…' : 'Criar projeto'),
        ),
      ],
    ),
  );
}

class ProjectDetails extends StatefulWidget {
  final AuthRepository repo;
  final String id;
  const ProjectDetails({super.key, required this.repo, required this.id});
  @override
  State<ProjectDetails> createState() => _ProjectDetailsState();
}

class _ProjectDetailsState extends State<ProjectDetails> {
  ProjectView? _project;
  bool _busy = false;
  bool _fileBusy = false;
  String? _error;
  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final p = await widget.repo.project(widget.id);
      if (mounted)
        setState(() {
          _project = p;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          _error = failureMessage(e);
        });
    } finally {
      if (mounted)
        setState(() {
          _busy = false;
        });
    }
  }

  Future<void> _archive() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Arquivar projeto?'),
        content: const Text(
          'O projeto ficará disponível na lista de arquivados para consulta.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirmar arquivamento'),
          ),
        ],
      ),
    );
    if (!mounted || confirmed != true) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.repo.archiveProject(widget.id);
      if (mounted) Navigator.pop(context, true);
    } catch (e) {
      if (mounted)
        setState(() {
          _error = failureMessage(e);
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
    final p = _project;
    return PopScope(
      canPop: !_busy && !_fileBusy,
      child: AlertDialog(
        title: Text(p?.title ?? 'Projeto'),
        content: SizedBox(
          width: 480,
          child: SingleChildScrollView(
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                if (_busy)
                  const Center(
                    child: CircularProgressIndicator(
                      semanticsLabel: 'Carregando projeto',
                    ),
                  ),
                if (_error != null)
                  FailureNotice(
                    _error!,
                    retry: p == null && !_busy ? _load : null,
                  ),
                if (p != null) ...[
                  Text(
                    p.status == 'ACTIVE'
                        ? 'Projeto ativo'
                        : 'Projeto arquivado',
                    style: Theme.of(context).textTheme.labelLarge,
                  ),
                  const SizedBox(height: 20),
                  Text('Cliente: ${p.client.name}'),
                  Text(p.client.email),
                  const SizedBox(height: 20),
                  Text('Saldo a receber: ${money(p.balanceCents)}'),
                  Text('Revisões incluídas: ${p.includedRevisionRounds}'),
                  FilesPanel(
                    projectId: p.id,
                    active: p.status == 'ACTIVE',
                    onBusy: (value) {
                      if (mounted)
                        setState(() {
                          _fileBusy = value;
                        });
                    },
                  ),
                ],
              ],
            ),
          ),
        ),
        actions: [
          TextButton(
            onPressed: _busy || _fileBusy ? null : () => Navigator.pop(context),
            child: const Text('Fechar'),
          ),
          if (p?.status == 'ACTIVE')
            OutlinedButton(
              onPressed: _busy || _fileBusy ? null : _archive,
              child: const Text('Arquivar projeto'),
            ),
        ],
      ),
    );
  }
}
