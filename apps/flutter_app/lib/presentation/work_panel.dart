import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/work.dart';
import '../data/auth_repository.dart';
import '../data/work_repository.dart';
import '../generated/api.g.dart';
import 'work_forms.dart';

String workError(Object error) => error is ApiFailure
    ? error.message
    : 'Não foi possível concluir. Tente novamente.';

class WorkPanel extends ConsumerStatefulWidget {
  const WorkPanel({super.key});
  @override
  ConsumerState<WorkPanel> createState() => _WorkPanelState();
}

class _WorkPanelState extends ConsumerState<WorkPanel> {
  final _search = TextEditingController();
  bool _clients = false, _archived = false, _loading = true;
  String? _cursor, _error;
  List<ClientView> _clientItems = [];
  List<ProjectView> _projectItems = [];
  int _request = 0;
  @override
  void initState() {
    super.initState();
    Future.microtask(_load);
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _load({bool more = false}) async {
    final ticket = ++_request;
    setState(() {
      _loading = true;
      _error = null;
      if (!more) {
        _clientItems = [];
        _projectItems = [];
        _cursor = null;
      }
    });
    try {
      final repo = ref.read(workRepositoryProvider);
      if (_clients) {
        final page = await repo.clients(
          cursor: more ? _cursor : null,
          search: _search.text.trim(),
        );
        if (!mounted || ticket != _request) return;
        setState(() {
          _clientItems = [..._clientItems, ...page.items];
          _cursor = page.nextCursor;
        });
      } else {
        final page = await repo.projects(
          cursor: more ? _cursor : null,
          search: _search.text.trim(),
          status: _archived ? 'ARCHIVED' : 'ACTIVE',
        );
        if (!mounted || ticket != _request) return;
        setState(() {
          _projectItems = [..._projectItems, ...page.items];
          _cursor = page.nextCursor;
        });
      }
    } catch (e) {
      if (mounted && ticket == _request) setState(() => _error = workError(e));
    } finally {
      if (mounted && ticket == _request) setState(() => _loading = false);
    }
  }

  Future<void> _edit({ClientView? client, ProjectView? project}) async {
    final repo = ref.read(workRepositoryProvider);
    final result = await showDialog<bool>(
      context: context,
      barrierDismissible: false,
      builder: (_) => _clients
          ? ClientForm(repo: repo, existing: client)
          : ProjectForm(repo: repo, existing: project),
    );
    if (!mounted) return;
    if (result == true) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Salvo com sucesso.')));
      await _load();
    }
  }

  Future<void> _archive(ProjectView project) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Arquivar projeto?'),
        content: Text(
          '“${project.title}” ficará na lista de arquivados e não poderá ser editado.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancelar'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Arquivar'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(workRepositoryProvider).archive(project);
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Projeto arquivado.')));
      await _load();
    } catch (e) {
      if (mounted)
        setState(() {
          _loading = false;
          _error = workError(e);
        });
    }
  }

  @override
  Widget build(BuildContext context) {
    final empty = _clients ? _clientItems.isEmpty : _projectItems.isEmpty;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Wrap(
          spacing: 12,
          runSpacing: 12,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(value: false, label: Text('Projetos')),
                ButtonSegment(value: true, label: Text('Clientes')),
              ],
              selected: {_clients},
              onSelectionChanged: _loading
                  ? null
                  : (value) {
                      setState(() {
                        _clients = value.single;
                        _search.clear();
                      });
                      _load();
                    },
            ),
            FilledButton.icon(
              onPressed: _loading ? null : () => _edit(),
              icon: const Icon(Icons.add),
              label: Text(_clients ? 'Novo cliente' : 'Novo projeto'),
            ),
          ],
        ),
        const SizedBox(height: 20),
        TextField(
          controller: _search,
          enabled: !_loading,
          textInputAction: TextInputAction.search,
          decoration: InputDecoration(
            labelText: _clients
                ? 'Buscar por nome ou e-mail'
                : 'Buscar por projeto ou cliente',
            suffixIcon: IconButton(
              tooltip: 'Buscar',
              onPressed: _loading ? null : () => _load(),
              icon: const Icon(Icons.search),
            ),
          ),
          onSubmitted: (_) => _load(),
        ),
        if (!_clients)
          Padding(
            padding: const EdgeInsets.only(top: 12),
            child: Wrap(
              spacing: 8,
              children: [
                ChoiceChip(
                  label: const Text('Ativos'),
                  selected: !_archived,
                  onSelected: _loading
                      ? null
                      : (_) {
                          setState(() => _archived = false);
                          _load();
                        },
                ),
                ChoiceChip(
                  label: const Text('Arquivados'),
                  selected: _archived,
                  onSelected: _loading
                      ? null
                      : (_) {
                          setState(() => _archived = true);
                          _load();
                        },
                ),
              ],
            ),
          ),
        const SizedBox(height: 20),
        if (_error != null) ...[
          Semantics(
            liveRegion: true,
            child: Text(
              _error!,
              style: TextStyle(color: Theme.of(context).colorScheme.error),
            ),
          ),
          TextButton(
            onPressed: _loading ? null : () => _load(),
            child: const Text('Atualizar lista'),
          ),
        ],
        if (_loading)
          const Padding(
            padding: EdgeInsets.all(24),
            child: Center(
              child: CircularProgressIndicator(
                semanticsLabel: 'Carregando lista',
              ),
            ),
          ),
        if (empty && !_loading && _error == null)
          Card(
            child: Padding(
              padding: const EdgeInsets.all(32),
              child: Column(
                children: [
                  Icon(
                    _clients ? Icons.people_outline : Icons.folder_outlined,
                    size: 48,
                  ),
                  const SizedBox(height: 16),
                  Text(
                    _search.text.isNotEmpty
                        ? 'Nenhum resultado para esta busca.'
                        : _clients
                        ? 'Cadastre seu primeiro cliente.'
                        : _archived
                        ? 'Nenhum projeto arquivado.'
                        : 'Um novo começo.',
                    style: Theme.of(context).textTheme.titleLarge,
                    textAlign: TextAlign.center,
                  ),
                  if (!_clients && !_archived && _search.text.isEmpty)
                    const Padding(
                      padding: EdgeInsets.only(top: 12),
                      child: Text(
                        'Cadastre um cliente e crie seu primeiro projeto.',
                        textAlign: TextAlign.center,
                      ),
                    ),
                ],
              ),
            ),
          ),
        if (_clients)
          ..._clientItems.map(
            (client) => Card(
              child: ListTile(
                title: Text(client.name),
                subtitle: Text(client.email),
                trailing: const Icon(Icons.edit_outlined),
                onTap: _loading ? null : () => _edit(client: client),
              ),
            ),
          )
        else
          ..._projectItems.map(
            (project) => Card(
              child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      project.title,
                      style: Theme.of(context).textTheme.titleLarge,
                    ),
                    const SizedBox(height: 8),
                    Text(project.client.name),
                    const SizedBox(height: 12),
                    Wrap(
                      spacing: 24,
                      runSpacing: 8,
                      children: [
                        Text('Saldo: ${brlLabel(project.balanceCents)}'),
                        Text(
                          'Revisões incluídas: ${project.includedRevisionRounds}',
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    if (project.status == 'ARCHIVED')
                      const Text('Arquivado • somente leitura')
                    else
                      Wrap(
                        spacing: 12,
                        children: [
                          OutlinedButton(
                            onPressed: _loading
                                ? null
                                : () => _edit(project: project),
                            child: const Text('Editar projeto'),
                          ),
                          TextButton(
                            onPressed: _loading
                                ? null
                                : () => _archive(project),
                            child: const Text('Arquivar'),
                          ),
                        ],
                      ),
                  ],
                ),
              ),
            ),
          ),
        if (_cursor != null)
          Padding(
            padding: const EdgeInsets.only(top: 16),
            child: OutlinedButton(
              onPressed: _loading ? null : () => _load(more: true),
              child: const Text('Carregar mais'),
            ),
          ),
      ],
    );
  }
}

class ClientPicker extends StatefulWidget {
  final WorkRepository repo;
  const ClientPicker({super.key, required this.repo});
  @override
  State<ClientPicker> createState() => _ClientPickerState();
}

class _ClientPickerState extends State<ClientPicker> {
  final _search = TextEditingController();
  List<ClientView> _items = [];
  String? _cursor, _error;
  bool _loading = true;
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
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final page = await widget.repo.clients(
        search: _search.text.trim(),
        cursor: more ? _cursor : null,
      );
      if (mounted)
        setState(() {
          _items = [...(more ? _items : <ClientView>[]), ...page.items];
          _cursor = page.nextCursor;
        });
    } catch (e) {
      if (mounted) setState(() => _error = workError(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Selecionar cliente'),
    content: SizedBox(
      width: 440,
      height: 360,
      child: Column(
        children: [
          TextField(
            controller: _search,
            enabled: !_loading,
            decoration: InputDecoration(
              labelText: 'Nome ou e-mail',
              suffixIcon: IconButton(
                tooltip: 'Buscar clientes',
                onPressed: _loading ? null : () => _load(),
                icon: const Icon(Icons.search),
              ),
            ),
            onSubmitted: (_) => _load(),
          ),
          const SizedBox(height: 12),
          if (_loading)
            const LinearProgressIndicator(
              semanticsLabel: 'Carregando clientes',
            ),
          if (_error != null) ...[
            Text(_error!),
            TextButton(
              onPressed: () => _load(),
              child: const Text('Tentar novamente'),
            ),
          ],
          Expanded(
            child: ListView(
              children: [
                if (_items.isEmpty && !_loading && _error == null)
                  const Padding(
                    padding: EdgeInsets.all(16),
                    child: Text(
                      'Nenhum cliente encontrado. Cadastre um cliente na aba Clientes.',
                    ),
                  ),
                ..._items.map(
                  (c) => ListTile(
                    title: Text(c.name),
                    subtitle: Text(c.email),
                    onTap: _loading ? null : () => Navigator.pop(context, c),
                  ),
                ),
                if (_cursor != null)
                  TextButton(
                    onPressed: _loading ? null : () => _load(more: true),
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
    ],
  );
}
