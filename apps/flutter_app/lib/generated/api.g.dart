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

class ProjectsView {
  final List<Map<String, dynamic>> items;
  final String? nextCursor;
  const ProjectsView({required this.items, required this.nextCursor});
  factory ProjectsView.fromJson(Map<String, dynamic> json) => ProjectsView(
    items: (json['items'] as List<dynamic>).map((e) => e as Map<String, dynamic>).toList(),
    nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String,
  );
  Map<String, dynamic> toJson() => {
    'items': items.map((e) => e).toList(),
    'nextCursor': nextCursor,
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
    final json = await transport('GET', '/api/v1/auth/csrf', null);
    return CsrfView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityView> authregister(RegisterDto body) async {
    final json = await transport('POST', '/api/v1/auth/register', body.toJson());
    return IdentityView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityView> authlogin(LoginDto body) async {
    final json = await transport('POST', '/api/v1/auth/login', body.toJson());
    return IdentityView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityView> authme() async {
    final json = await transport('GET', '/api/v1/auth/me', null);
    return IdentityView.fromJson(json as Map<String, dynamic>);
  }
  Future<void> authlogout() async {
    await transport('POST', '/api/v1/auth/logout', null);
  }
  Future<ProjectsView> projectslist() async {
    final json = await transport('GET', '/api/v1/projects', null);
    return ProjectsView.fromJson(json as Map<String, dynamic>);
  }
  Future<HealthView> healthhealth() async {
    final json = await transport('GET', '/api/v1/health', null);
    return HealthView.fromJson(json as Map<String, dynamic>);
  }
  Future<HealthView> healthready() async {
    final json = await transport('GET', '/api/v1/ready', null);
    return HealthView.fromJson(json as Map<String, dynamic>);
  }
}
