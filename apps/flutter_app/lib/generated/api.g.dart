// GENERATED FROM packages/contracts/openapi.json. DO NOT EDIT.
// dart format off

class ErrorBody {
  final String code;
  final String message;
  final Map<String, dynamic>? details;
  const ErrorBody({required this.code, required this.message, this.details});
  factory ErrorBody.fromJson(Map<String, dynamic> json) => ErrorBody(
    code: json['code'] as String,
    message: json['message'] as String,
    details: json['details'] == null ? null : json['details'] as Map<String, dynamic>,
  );
  Map<String, dynamic> toJson() => {
    'code': code,
    'message': message,
    'details': details,
  };
}

class ErrorView {
  final ErrorBody error;
  final String requestId;
  const ErrorView({required this.error, required this.requestId});
  factory ErrorView.fromJson(Map<String, dynamic> json) => ErrorView(
    error: ErrorBody.fromJson(json['error'] as Map<String, dynamic>),
    requestId: json['requestId'] as String,
  );
  Map<String, dynamic> toJson() => {
    'error': error.toJson(),
    'requestId': requestId,
  };
}

class CsrfView {
  final String csrfToken;
  const CsrfView({required this.csrfToken});
  factory CsrfView.fromJson(Map<String, dynamic> json) => CsrfView(
    csrfToken: json['csrfToken'] as String,
  );
  Map<String, dynamic> toJson() => {
    'csrfToken': csrfToken,
  };
}

class RegisterDto {
  final String email;
  static const emailMaxLength = 254;
  final String password;
  static const passwordMinLength = 12;
  static const passwordMaxLength = 128;
  final String name;
  static const nameMinLength = 1;
  static const nameMaxLength = 120;
  final String workspaceName;
  static const workspaceNameMinLength = 1;
  static const workspaceNameMaxLength = 120;
  const RegisterDto({required this.email, required this.password, required this.name, required this.workspaceName});
  factory RegisterDto.fromJson(Map<String, dynamic> json) => RegisterDto(
    email: json['email'] as String,
    password: json['password'] as String,
    name: json['name'] as String,
    workspaceName: json['workspaceName'] as String,
  );
  Map<String, dynamic> toJson() => {
    'email': email,
    'password': password,
    'name': name,
    'workspaceName': workspaceName,
  };
}

class UserView {
  final String id;
  final String name;
  final String email;
  const UserView({required this.id, required this.name, required this.email});
  factory UserView.fromJson(Map<String, dynamic> json) => UserView(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
  };
}

class WorkspaceView {
  final String id;
  final String name;
  const WorkspaceView({required this.id, required this.name});
  factory WorkspaceView.fromJson(Map<String, dynamic> json) => WorkspaceView(
    id: json['id'] as String,
    name: json['name'] as String,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
  };
}

class IdentityView {
  final UserView user;
  final WorkspaceView workspace;
  const IdentityView({required this.user, required this.workspace});
  factory IdentityView.fromJson(Map<String, dynamic> json) => IdentityView(
    user: UserView.fromJson(json['user'] as Map<String, dynamic>),
    workspace: WorkspaceView.fromJson(json['workspace'] as Map<String, dynamic>),
  );
  Map<String, dynamic> toJson() => {
    'user': user.toJson(),
    'workspace': workspace.toJson(),
  };
}

class LoginDto {
  final String email;
  static const emailMaxLength = 254;
  final String password;
  static const passwordMinLength = 12;
  static const passwordMaxLength = 128;
  const LoginDto({required this.email, required this.password});
  factory LoginDto.fromJson(Map<String, dynamic> json) => LoginDto(
    email: json['email'] as String,
    password: json['password'] as String,
  );
  Map<String, dynamic> toJson() => {
    'email': email,
    'password': password,
  };
}

class ClientView {
  final String id;
  final String name;
  final String email;
  final int revision;
  const ClientView({required this.id, required this.name, required this.email, required this.revision});
  factory ClientView.fromJson(Map<String, dynamic> json) => ClientView(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    revision: json['revision'] as int,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'revision': revision,
  };
}

class ProjectView {
  final String id;
  final String title;
  final ClientView client;
  final String currency;
  final int balanceCents;
  final int includedRevisionRounds;
  final String status;
  final int revision;
  const ProjectView({required this.id, required this.title, required this.client, required this.currency, required this.balanceCents, required this.includedRevisionRounds, required this.status, required this.revision});
  factory ProjectView.fromJson(Map<String, dynamic> json) => ProjectView(
    id: json['id'] as String,
    title: json['title'] as String,
    client: ClientView.fromJson(json['client'] as Map<String, dynamic>),
    currency: json['currency'] as String,
    balanceCents: json['balanceCents'] as int,
    includedRevisionRounds: json['includedRevisionRounds'] as int,
    status: json['status'] as String,
    revision: json['revision'] as int,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'client': client.toJson(),
    'currency': currency,
    'balanceCents': balanceCents,
    'includedRevisionRounds': includedRevisionRounds,
    'status': status,
    'revision': revision,
  };
}

class ProjectsView {
  final List<ProjectView> items;
  final String? nextCursor;
  const ProjectsView({required this.items, required this.nextCursor});
  factory ProjectsView.fromJson(Map<String, dynamic> json) => ProjectsView(
    items: (json['items'] as List<dynamic>).map((e) => ProjectView.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String,
  );
  Map<String, dynamic> toJson() => {
    'items': items.map((e) => e.toJson()).toList(),
    'nextCursor': nextCursor,
  };
}

class ProjectDto {
  final String clientId;
  final String title;
  static const titleMinLength = 1;
  static const titleMaxLength = 120;
  final int balanceCents;
  static const balanceCentsMinimum = 0;
  static const balanceCentsMaximum = 2147483647;
  final int includedRevisionRounds;
  static const includedRevisionRoundsMinimum = 0;
  static const includedRevisionRoundsMaximum = 1000;
  const ProjectDto({required this.clientId, required this.title, required this.balanceCents, required this.includedRevisionRounds});
  factory ProjectDto.fromJson(Map<String, dynamic> json) => ProjectDto(
    clientId: json['clientId'] as String,
    title: json['title'] as String,
    balanceCents: json['balanceCents'] as int,
    includedRevisionRounds: json['includedRevisionRounds'] as int,
  );
  Map<String, dynamic> toJson() => {
    'clientId': clientId,
    'title': title,
    'balanceCents': balanceCents,
    'includedRevisionRounds': includedRevisionRounds,
  };
}

class UpdateProjectDto {
  final String clientId;
  final String title;
  static const titleMinLength = 1;
  static const titleMaxLength = 120;
  final int balanceCents;
  static const balanceCentsMinimum = 0;
  static const balanceCentsMaximum = 2147483647;
  final int includedRevisionRounds;
  static const includedRevisionRoundsMinimum = 0;
  static const includedRevisionRoundsMaximum = 1000;
  final int revision;
  static const revisionMinimum = 1;
  static const revisionMaximum = 2147483646;
  const UpdateProjectDto({required this.clientId, required this.title, required this.balanceCents, required this.includedRevisionRounds, required this.revision});
  factory UpdateProjectDto.fromJson(Map<String, dynamic> json) => UpdateProjectDto(
    clientId: json['clientId'] as String,
    title: json['title'] as String,
    balanceCents: json['balanceCents'] as int,
    includedRevisionRounds: json['includedRevisionRounds'] as int,
    revision: json['revision'] as int,
  );
  Map<String, dynamic> toJson() => {
    'clientId': clientId,
    'title': title,
    'balanceCents': balanceCents,
    'includedRevisionRounds': includedRevisionRounds,
    'revision': revision,
  };
}

class RevisionDto {
  final int revision;
  static const revisionMinimum = 1;
  static const revisionMaximum = 2147483646;
  const RevisionDto({required this.revision});
  factory RevisionDto.fromJson(Map<String, dynamic> json) => RevisionDto(
    revision: json['revision'] as int,
  );
  Map<String, dynamic> toJson() => {
    'revision': revision,
  };
}

class ClientsView {
  final List<ClientView> items;
  final String? nextCursor;
  const ClientsView({required this.items, required this.nextCursor});
  factory ClientsView.fromJson(Map<String, dynamic> json) => ClientsView(
    items: (json['items'] as List<dynamic>).map((e) => ClientView.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String,
  );
  Map<String, dynamic> toJson() => {
    'items': items.map((e) => e.toJson()).toList(),
    'nextCursor': nextCursor,
  };
}

class ClientDto {
  final String name;
  static const nameMinLength = 1;
  static const nameMaxLength = 120;
  final String email;
  static const emailMaxLength = 254;
  const ClientDto({required this.name, required this.email});
  factory ClientDto.fromJson(Map<String, dynamic> json) => ClientDto(
    name: json['name'] as String,
    email: json['email'] as String,
  );
  Map<String, dynamic> toJson() => {
    'name': name,
    'email': email,
  };
}

class UpdateClientDto {
  final String name;
  static const nameMinLength = 1;
  static const nameMaxLength = 120;
  final String email;
  static const emailMaxLength = 254;
  final int revision;
  static const revisionMinimum = 1;
  static const revisionMaximum = 2147483646;
  const UpdateClientDto({required this.name, required this.email, required this.revision});
  factory UpdateClientDto.fromJson(Map<String, dynamic> json) => UpdateClientDto(
    name: json['name'] as String,
    email: json['email'] as String,
    revision: json['revision'] as int,
  );
  Map<String, dynamic> toJson() => {
    'name': name,
    'email': email,
    'revision': revision,
  };
}

class HealthView {
  final String status;
  const HealthView({required this.status});
  factory HealthView.fromJson(Map<String, dynamic> json) => HealthView(
    status: json['status'] as String,
  );
  Map<String, dynamic> toJson() => {
    'status': status,
  };
}

typedef JsonTransport = Future<dynamic> Function(String method, String path, Map<String, dynamic>? body);

class CofreClient {
  final JsonTransport transport;
  const CofreClient(this.transport);
  Future<CsrfView> authcsrf() async {
    final path = '/api/v1/auth/csrf';
    final json = await transport('GET', path, null);
    return CsrfView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityView> authregister(RegisterDto body) async {
    final path = '/api/v1/auth/register';
    final json = await transport('POST', path, body.toJson());
    return IdentityView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityView> authlogin(LoginDto body) async {
    final path = '/api/v1/auth/login';
    final json = await transport('POST', path, body.toJson());
    return IdentityView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityView> authme() async {
    final path = '/api/v1/auth/me';
    final json = await transport('GET', path, null);
    return IdentityView.fromJson(json as Map<String, dynamic>);
  }
  Future<void> authlogout() async {
    final path = '/api/v1/auth/logout';
    await transport('POST', path, null);
  }
  Future<ProjectsView> projectslist({String? cursor, int? limit, String? search, String? status}) async {
    final query = <String, String>{
      if (cursor != null) 'cursor': cursor.toString(),
      if (limit != null) 'limit': limit.toString(),
      if (search != null) 'search': search.toString(),
      if (status != null) 'status': status.toString(),
    };
    final path = Uri(path: '/api/v1/projects', queryParameters: query.isEmpty ? null : query).toString();
    final json = await transport('GET', path, null);
    return ProjectsView.fromJson(json as Map<String, dynamic>);
  }
  Future<ProjectView> projectscreate(ProjectDto body) async {
    final path = '/api/v1/projects';
    final json = await transport('POST', path, body.toJson());
    return ProjectView.fromJson(json as Map<String, dynamic>);
  }
  Future<ProjectView> projectsget({required String id}) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id)}';
    final json = await transport('GET', path, null);
    return ProjectView.fromJson(json as Map<String, dynamic>);
  }
  Future<ProjectView> projectsupdate(UpdateProjectDto body, {required String id}) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id)}';
    final json = await transport('PATCH', path, body.toJson());
    return ProjectView.fromJson(json as Map<String, dynamic>);
  }
  Future<ProjectView> projectsarchive(RevisionDto body, {required String id}) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id)}/archive';
    final json = await transport('POST', path, body.toJson());
    return ProjectView.fromJson(json as Map<String, dynamic>);
  }
  Future<ClientsView> clientslist({String? cursor, int? limit, String? search}) async {
    final query = <String, String>{
      if (cursor != null) 'cursor': cursor.toString(),
      if (limit != null) 'limit': limit.toString(),
      if (search != null) 'search': search.toString(),
    };
    final path = Uri(path: '/api/v1/clients', queryParameters: query.isEmpty ? null : query).toString();
    final json = await transport('GET', path, null);
    return ClientsView.fromJson(json as Map<String, dynamic>);
  }
  Future<ClientView> clientscreate(ClientDto body) async {
    final path = '/api/v1/clients';
    final json = await transport('POST', path, body.toJson());
    return ClientView.fromJson(json as Map<String, dynamic>);
  }
  Future<ClientView> clientsupdate(UpdateClientDto body, {required String id}) async {
    final path = '/api/v1/clients/${Uri.encodeComponent(id)}';
    final json = await transport('PATCH', path, body.toJson());
    return ClientView.fromJson(json as Map<String, dynamic>);
  }
  Future<HealthView> healthhealth() async {
    final path = '/api/v1/health';
    final json = await transport('GET', path, null);
    return HealthView.fromJson(json as Map<String, dynamic>);
  }
  Future<HealthView> healthready() async {
    final path = '/api/v1/ready';
    final json = await transport('GET', path, null);
    return HealthView.fromJson(json as Map<String, dynamic>);
  }
}
