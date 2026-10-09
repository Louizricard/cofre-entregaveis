import 'package:cofre_app/data/work_repository.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/generated/api.g.dart';

class FakeWork implements WorkRepository {
  final clientItems = <ClientView>[];
  final projectItems = <ProjectView>[];
  bool failSave = false;
  String? lastSearch;
  @override
  Future<ClientsView> clients({String? cursor, String? search}) async =>
      ClientsView(
        items: clientItems
            .where(
              (c) =>
                  search == null ||
                  c.name.contains(search) ||
                  c.email.contains(search),
            )
            .toList(),
        nextCursor: null,
      );
  @override
  Future<ProjectsView> projects({
    String? cursor,
    String? search,
    String status = 'ACTIVE',
  }) async {
    lastSearch = search;
    return ProjectsView(
      items: projectItems
          .where(
            (p) =>
                p.status == status &&
                (search == null || p.title.contains(search)),
          )
          .toList(),
      nextCursor: null,
    );
  }

  @override
  Future<ClientView> saveClient(ClientDto input, {ClientView? existing}) async {
    if (failSave)
      throw const ApiFailure(409, 'Este registro mudou. Atualize a lista.');
    final result = ClientView(
      id: existing?.id ?? 'cliente-${clientItems.length}',
      name: input.name,
      email: input.email,
      revision: (existing?.revision ?? 0) + 1,
    );
    clientItems.removeWhere((c) => c.id == result.id);
    clientItems.add(result);
    return result;
  }

  @override
  Future<ProjectView> saveProject(
    ProjectDto input, {
    ProjectView? existing,
  }) async {
    if (failSave)
      throw const ApiFailure(409, 'Este registro mudou. Atualize a lista.');
    final result = ProjectView(
      id: existing?.id ?? 'projeto-${projectItems.length}',
      title: input.title,
      client: clientItems.firstWhere((c) => c.id == input.clientId),
      currency: 'BRL',
      balanceCents: input.balanceCents,
      includedRevisionRounds: input.includedRevisionRounds,
      status: 'ACTIVE',
      revision: (existing?.revision ?? 0) + 1,
    );
    projectItems.removeWhere((p) => p.id == result.id);
    projectItems.add(result);
    return result;
  }

  @override
  Future<ProjectView> archive(ProjectView project) async {
    final result = ProjectView(
      id: project.id,
      title: project.title,
      client: project.client,
      currency: project.currency,
      balanceCents: project.balanceCents,
      includedRevisionRounds: project.includedRevisionRounds,
      status: 'ARCHIVED',
      revision: project.revision + 1,
    );
    projectItems.removeWhere((p) => p.id == result.id);
    projectItems.add(result);
    return result;
  }
}
