import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../data/auth_repository.dart';
import '../data/sharing_repository.dart';
import '../generated/api.g.dart';
import 'preview.dart';
import 'comments.dart';
import 'revisions.dart';
import 'approvals.dart';
import 'finance.dart';
import 'guest_identity.dart';

class GuestEntryScreen extends ConsumerStatefulWidget {
  final String token;
  const GuestEntryScreen({super.key, required this.token});
  @override
  ConsumerState<GuestEntryScreen> createState() => _GuestEntryScreenState();
}

class _GuestEntryScreenState extends ConsumerState<GuestEntryScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      ref.read(guestTicketProvider).token = widget.token;
      // Replace first; the HTTP exchange only begins on the clean /portal route.
      Router.neglect(context, () => context.go('/portal'));
    });
  }

  @override
  Widget build(BuildContext context) =>
      const Scaffold(body: Center(child: CircularProgressIndicator()));
}

class GuestPortalScreen extends ConsumerStatefulWidget {
  const GuestPortalScreen({super.key});
  @override
  ConsumerState<GuestPortalScreen> createState() => _GuestPortalScreenState();
}

class _GuestPortalScreenState extends ConsumerState<GuestPortalScreen> {
  GuestProjectView? _project;
  GuestVersionView? _version;
  List<GuestVersionSummary> _versions = [];
  String? _cursor;
  String? _error;
  bool _busy = true;
  bool _ended = false;
  bool _needsLink = false;
  GuestRepository get _repo => ref.read(guestRepositoryProvider);
  @override
  void initState() {
    super.initState();
    _initialize();
  }

  String _message(Object e) => e is ApiFailure
      ? e.message
      : 'Não foi possível carregar as prévias. Tente novamente.';
  Future<void> _initialize() async {
    final token = ref.read(guestTicketProvider).take();
    try {
      if (token != null) await _repo.bootstrap(token);
      await _load();
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
          _needsLink = token != null;
          _busy = false;
          _project = null;
          _version = null;
        });
    }
  }

  Future<void> _load() async {
    if (!mounted) return;
    setState(() {
      _busy = true;
      _error = null;
      _version = null;
      _project = null;
      _versions = [];
      _cursor = null;
    });
    try {
      final project = await _repo.project();
      final versions = await _repo.versions();
      final version = await _repo.version(project.currentVersion.id);
      if (mounted)
        setState(() {
          _project = project;
          _versions = versions.items;
          _cursor = versions.nextCursor;
          _version = version;
        });
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _select(String id) async {
    setState(() {
      _busy = true;
      _error = null;
      _version = null;
    });
    try {
      final version = await _repo.version(id);
      if (mounted) setState(() => _version = version);
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
          if (e is ApiFailure && e.status == 401) {
            _project = null;
            _versions = [];
          }
        });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _more() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final versions = await _repo.versions(cursor: _cursor);
      if (mounted)
        setState(() {
          final all = {
            for (final v in [..._versions, ...versions.items]) v.id: v,
          };
          _versions = all.values.toList();
          _cursor = versions.nextCursor;
        });
    } catch (e) {
      if (mounted)
        setState(() {
          _error = _message(e);
          if (e is ApiFailure && e.status == 401) {
            _project = null;
            _version = null;
            _versions = [];
          }
        });
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _logout() async {
    setState(() {
      _busy = true;
      _error = null;
      _version = null;
      _project = null;
      _versions = [];
    });
    try {
      await _repo.logout();
      if (mounted) setState(() => _ended = true);
    } catch (e) {
      if (mounted) setState(() => _error = _message(e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => Scaffold(
    appBar: AppBar(
      title: const Text('Cofre • prévias'),
      actions: [
        if (!_ended)
          TextButton(
            onPressed: _busy ? null : _logout,
            child: const Text('Encerrar acesso'),
          ),
      ],
    ),
    body: Center(
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 960),
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              if (_busy) const LinearProgressIndicator(),
              if (_ended)
                const Text(
                  'Acesso encerrado. Para voltar, abra novamente o link recebido.',
                ),
              if (_error != null) ...[
                Text(_error!),
                const Text(
                  'Se o link expirou ou foi revogado, solicite um novo ao responsável.',
                ),
                if (!_needsLink)
                  TextButton(
                    onPressed: _busy ? null : _load,
                    child: const Text('Tentar novamente'),
                  ),
              ],
              if (_project != null) ...[
                Text(
                  _project!.title,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 12),
                Text(
                  'Saldo informado: R\$ ${(_project!.balanceCents / 100).toStringAsFixed(2).replaceAll('.', ',')}',
                ),
                const Text(
                  'Visualize as prévias abaixo. Os originais permanecem protegidos.',
                ),
                const SizedBox(height: 16),
                const GuestIdentityPanel(),
                const Text(
                  'Os originais exigem e-mail confirmado, aprovação da versão atual e pagamento ou dispensa registrados pelo criador.',
                ),
                OutlinedButton(
                  onPressed: _busy || _version == null
                      ? null
                      : () => showDialog<void>(
                          context: context,
                          builder: (_) => ApprovalDialog(
                            versionId: _version!.id,
                            guest: true,
                          ),
                        ),
                  child: const Text('Aprovar versão / Ver aprovação'),
                ),
                OutlinedButton(
                  onPressed: _busy || _version == null
                      ? null
                      : () => showDialog<void>(
                          context: context,
                          builder: (_) => RevisionsDialog(
                            projectId: '',
                            versionId: _version!.id,
                            guest: true,
                          ),
                        ),
                  child: const Text('Pedir ajustes / Ver rodadas'),
                ),
                const SizedBox(height: 20),
                DropdownButtonFormField<String>(
                  key: ValueKey(_version?.id),
                  initialValue: _version?.id,
                  isExpanded: true,
                  decoration: const InputDecoration(labelText: 'Versão'),
                  items: _versions
                      .map(
                        (v) => DropdownMenuItem(
                          value: v.id,
                          child: Text(
                            'V${v.number} • ${v.state == 'PUBLISHED' ? 'Atual' : 'Histórico'}',
                          ),
                        ),
                      )
                      .toList(),
                  onChanged: _busy
                      ? null
                      : (id) {
                          if (id != null) _select(id);
                        },
                ),
                if (_cursor != null)
                  TextButton(
                    onPressed: _busy ? null : _more,
                    child: const Text('Mais versões'),
                  ),
                if (_version?.state == 'SUPERSEDED')
                  const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: Text(
                      'Versão anterior para consulta. Confira a versão atual antes de solicitar alterações.',
                    ),
                  ),
                const SizedBox(height: 16),
                for (final a in _version?.assets ?? <GuestAssetView>[])
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(16),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            a.fileName,
                            style: Theme.of(context).textTheme.titleMedium,
                          ),
                          Text(
                            '${(int.parse(a.sizeBytes) / 1024).toStringAsFixed(1)} KiB',
                          ),
                          TextButton.icon(
                            onPressed: _busy
                                ? null
                                : () => showDialog<void>(
                                    context: context,
                                    builder: (_) => CommentsDialog(
                                      assetId: a.id,
                                      fileName: a.fileName,
                                      guest: true,
                                    ),
                                  ),
                            icon: const Icon(Icons.comment),
                            label: const Text('Comentários'),
                          ),
                          TextButton.icon(
                            onPressed: _busy
                                ? null
                                : () => showDialog<void>(
                                    context: context,
                                    builder: (_) => PreviewDialog(
                                      assetId: a.id,
                                      fileName: a.fileName,
                                      canRetry: false,
                                      loadStatus: () => _repo.status(a.id),
                                      loadPreview: (page) =>
                                          _repo.preview(a.id, page),
                                    ),
                                  ),
                            icon: const Icon(Icons.visibility),
                            label: const Text('Ver prévia'),
                          ),
                          GuestOriginalButton(
                            key: ValueKey('original-${a.id}'),
                            assetId: a.id,
                          ),
                        ],
                      ),
                    ),
                  ),
                const SizedBox(height: 16),
                TextButton(
                  onPressed: _busy ? null : _load,
                  child: const Text('Atualizar projeto'),
                ),
              ],
            ],
          ),
        ),
      ),
    ),
  );
}
