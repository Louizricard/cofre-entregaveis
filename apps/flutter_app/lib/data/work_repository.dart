import '../generated/api.g.dart';

abstract interface class WorkRepository {
  Future<ClientsView> clients({String? cursor, String? search});
  Future<ProjectsView> projects({
    String? cursor,
    String? search,
    String status = 'ACTIVE',
  });
  Future<ClientView> saveClient(ClientDto input, {ClientView? existing});
  Future<ProjectView> saveProject(ProjectDto input, {ProjectView? existing});
  Future<ProjectView> archive(ProjectView project);
}

class HttpWorkRepository implements WorkRepository {
  final CofreClient api;
  const HttpWorkRepository(this.api);
  @override
  Future<ClientsView> clients({String? cursor, String? search}) =>
      api.clientslist(cursor: cursor, search: search);
  @override
  Future<ProjectsView> projects({
    String? cursor,
    String? search,
    String status = 'ACTIVE',
  }) => api.projectslist(cursor: cursor, search: search, status: status);
  @override
  Future<ClientView> saveClient(ClientDto input, {ClientView? existing}) =>
      existing == null
      ? api.clientscreate(input)
      : api.clientsupdate(
          UpdateClientDto(
            name: input.name,
            email: input.email,
            revision: existing.revision,
          ),
          id: existing.id,
        );
  @override
  Future<ProjectView> saveProject(ProjectDto input, {ProjectView? existing}) =>
      existing == null
      ? api.projectscreate(input)
      : api.projectsupdate(
          UpdateProjectDto(
            clientId: input.clientId,
            title: input.title,
            balanceCents: input.balanceCents,
            includedRevisionRounds: input.includedRevisionRounds,
            revision: existing.revision,
          ),
          id: existing.id,
        );
  @override
  Future<ProjectView> archive(ProjectView project) => api.projectsarchive(
    RevisionDto(revision: project.revision),
    id: project.id,
  );
}
