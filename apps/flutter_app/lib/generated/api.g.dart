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
  final String createdAt;
  const ClientView({required this.id, required this.name, required this.email, required this.createdAt});
  factory ClientView.fromJson(Map<String, dynamic> json) => ClientView(
    id: json['id'] as String,
    name: json['name'] as String,
    email: json['email'] as String,
    createdAt: json['createdAt'] as String,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'name': name,
    'email': email,
    'createdAt': createdAt,
  };
}

class ProjectView {
  final String id;
  final String title;
  final String currency;
  final int balanceCents;
  final int includedRevisionRounds;
  final String status;
  final ClientView client;
  final String createdAt;
  final String updatedAt;
  const ProjectView({required this.id, required this.title, required this.currency, required this.balanceCents, required this.includedRevisionRounds, required this.status, required this.client, required this.createdAt, required this.updatedAt});
  factory ProjectView.fromJson(Map<String, dynamic> json) => ProjectView(
    id: json['id'] as String,
    title: json['title'] as String,
    currency: json['currency'] as String,
    balanceCents: json['balanceCents'] as int,
    includedRevisionRounds: json['includedRevisionRounds'] as int,
    status: json['status'] as String,
    client: ClientView.fromJson(json['client'] as Map<String, dynamic>),
    createdAt: json['createdAt'] as String,
    updatedAt: json['updatedAt'] as String,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'title': title,
    'currency': currency,
    'balanceCents': balanceCents,
    'includedRevisionRounds': includedRevisionRounds,
    'status': status,
    'client': client.toJson(),
    'createdAt': createdAt,
    'updatedAt': updatedAt,
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

class CreateProjectDto {
  final String clientId;
  final String title;
  static const titleMinLength = 1;
  static const titleMaxLength = 160;
  final int balanceCents;
  static const balanceCentsMinimum = 0;
  static const balanceCentsMaximum = 2147483647;
  final int includedRevisionRounds;
  static const includedRevisionRoundsMinimum = 0;
  static const includedRevisionRoundsMaximum = 1000;
  const CreateProjectDto({required this.clientId, required this.title, required this.balanceCents, required this.includedRevisionRounds});
  factory CreateProjectDto.fromJson(Map<String, dynamic> json) => CreateProjectDto(
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

class EmptyDto {
  const EmptyDto();
  factory EmptyDto.fromJson(Map<String, dynamic> json) => const EmptyDto(
  );
  Map<String, dynamic> toJson() => {
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

class CreateClientDto {
  final String name;
  static const nameMinLength = 1;
  static const nameMaxLength = 120;
  final String email;
  static const emailMaxLength = 254;
  const CreateClientDto({required this.name, required this.email});
  factory CreateClientDto.fromJson(Map<String, dynamic> json) => CreateClientDto(
    name: json['name'] as String,
    email: json['email'] as String,
  );
  Map<String, dynamic> toJson() => {
    'name': name,
    'email': email,
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

class PreviewStateView {
  final String state;
  final String? failureCode;
  final int pages;
  const PreviewStateView({required this.state, required this.failureCode, required this.pages});
  factory PreviewStateView.fromJson(Map<String, dynamic> json) => PreviewStateView(
    state: json['state'] as String,
    failureCode: json['failureCode'] == null ? null : json['failureCode'] as String,
    pages: json['pages'] as int,
  );
  Map<String, dynamic> toJson() => {
    'state': state,
    'failureCode': failureCode,
    'pages': pages,
  };
}

class ManualPreviewDto {
  final String previewAssetId;
  const ManualPreviewDto({required this.previewAssetId});
  factory ManualPreviewDto.fromJson(Map<String, dynamic> json) => ManualPreviewDto(
    previewAssetId: json['previewAssetId'] as String,
  );
  Map<String, dynamic> toJson() => {
    'previewAssetId': previewAssetId,
  };
}

class PreviewPageDto {
  final int page;
  static const pageMinimum = 1;
  static const pageMaximum = 100;
  const PreviewPageDto({required this.page});
  factory PreviewPageDto.fromJson(Map<String, dynamic> json) => PreviewPageDto(
    page: json['page'] as int,
  );
  Map<String, dynamic> toJson() => {
    'page': page,
  };
}

class PreviewView {
  final String kind;
  final String mime;
  final int? durationMs;
  final String url;
  final String expiresAt;
  final int page;
  final int pages;
  const PreviewView({required this.kind, required this.mime, required this.durationMs, required this.url, required this.expiresAt, required this.page, required this.pages});
  factory PreviewView.fromJson(Map<String, dynamic> json) => PreviewView(
    kind: json['kind'] as String,
    mime: json['mime'] as String,
    durationMs: json['durationMs'] == null ? null : json['durationMs'] as int,
    url: json['url'] as String,
    expiresAt: json['expiresAt'] as String,
    page: json['page'] as int,
    pages: json['pages'] as int,
  );
  Map<String, dynamic> toJson() => {
    'kind': kind,
    'mime': mime,
    'durationMs': durationMs,
    'url': url,
    'expiresAt': expiresAt,
    'page': page,
    'pages': pages,
  };
}

class StorageView {
  final bool enabled;
  final String maxFileBytes;
  final String quotaBytes;
  final String usedBytes;
  final String reservedBytes;
  final int activeUploads;
  final int maxActiveUploads;
  final List<String> mimeTypes;
  const StorageView({required this.enabled, required this.maxFileBytes, required this.quotaBytes, required this.usedBytes, required this.reservedBytes, required this.activeUploads, required this.maxActiveUploads, required this.mimeTypes});
  factory StorageView.fromJson(Map<String, dynamic> json) => StorageView(
    enabled: json['enabled'] as bool,
    maxFileBytes: json['maxFileBytes'] as String,
    quotaBytes: json['quotaBytes'] as String,
    usedBytes: json['usedBytes'] as String,
    reservedBytes: json['reservedBytes'] as String,
    activeUploads: json['activeUploads'] as int,
    maxActiveUploads: json['maxActiveUploads'] as int,
    mimeTypes: (json['mimeTypes'] as List<dynamic>).map((e) => e as String).toList(),
  );
  Map<String, dynamic> toJson() => {
    'enabled': enabled,
    'maxFileBytes': maxFileBytes,
    'quotaBytes': quotaBytes,
    'usedBytes': usedBytes,
    'reservedBytes': reservedBytes,
    'activeUploads': activeUploads,
    'maxActiveUploads': maxActiveUploads,
    'mimeTypes': mimeTypes.map((e) => e).toList(),
  };
}

class AssetView {
  final String scanStatus;
  final String id;
  final String fileName;
  final String mime;
  final String sizeBytes;
  final String status;
  final String? failureCode;
  final String expiresAt;
  const AssetView({required this.scanStatus, required this.id, required this.fileName, required this.mime, required this.sizeBytes, required this.status, required this.failureCode, required this.expiresAt});
  factory AssetView.fromJson(Map<String, dynamic> json) => AssetView(
    scanStatus: json['scanStatus'] as String,
    id: json['id'] as String,
    fileName: json['fileName'] as String,
    mime: json['mime'] as String,
    sizeBytes: json['sizeBytes'] as String,
    status: json['status'] as String,
    failureCode: json['failureCode'] == null ? null : json['failureCode'] as String,
    expiresAt: json['expiresAt'] as String,
  );
  Map<String, dynamic> toJson() => {
    'scanStatus': scanStatus,
    'id': id,
    'fileName': fileName,
    'mime': mime,
    'sizeBytes': sizeBytes,
    'status': status,
    'failureCode': failureCode,
    'expiresAt': expiresAt,
  };
}

class VersionView {
  final int projectRevision;
  final String id;
  final int number;
  final String state;
  final String createdAt;
  final List<AssetView> assets;
  const VersionView({required this.projectRevision, required this.id, required this.number, required this.state, required this.createdAt, required this.assets});
  factory VersionView.fromJson(Map<String, dynamic> json) => VersionView(
    projectRevision: json['projectRevision'] as int,
    id: json['id'] as String,
    number: json['number'] as int,
    state: json['state'] as String,
    createdAt: json['createdAt'] as String,
    assets: (json['assets'] as List<dynamic>).map((e) => AssetView.fromJson(e as Map<String, dynamic>)).toList(),
  );
  Map<String, dynamic> toJson() => {
    'projectRevision': projectRevision,
    'id': id,
    'number': number,
    'state': state,
    'createdAt': createdAt,
    'assets': assets.map((e) => e.toJson()).toList(),
  };
}

class VersionsView {
  final List<VersionView> items;
  final String? nextCursor;
  const VersionsView({required this.items, required this.nextCursor});
  factory VersionsView.fromJson(Map<String, dynamic> json) => VersionsView(
    items: (json['items'] as List<dynamic>).map((e) => VersionView.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String,
  );
  Map<String, dynamic> toJson() => {
    'items': items.map((e) => e.toJson()).toList(),
    'nextCursor': nextCursor,
  };
}

class PublishVersionDto {
  final int expectedProjectRevision;
  static const expectedProjectRevisionMinimum = 0;
  static const expectedProjectRevisionMaximum = 2147483647;
  const PublishVersionDto({required this.expectedProjectRevision});
  factory PublishVersionDto.fromJson(Map<String, dynamic> json) => PublishVersionDto(
    expectedProjectRevision: json['expectedProjectRevision'] as int,
  );
  Map<String, dynamic> toJson() => {
    'expectedProjectRevision': expectedProjectRevision,
  };
}

class StartUploadDto {
  final String fileName;
  static const fileNameMinLength = 1;
  static const fileNameMaxLength = 200;
  final String declaredMime;
  static const declaredMimeMaxLength = 100;
  final String sizeBytes;
  const StartUploadDto({required this.fileName, required this.declaredMime, required this.sizeBytes});
  factory StartUploadDto.fromJson(Map<String, dynamic> json) => StartUploadDto(
    fileName: json['fileName'] as String,
    declaredMime: json['declaredMime'] as String,
    sizeBytes: json['sizeBytes'] as String,
  );
  Map<String, dynamic> toJson() => {
    'fileName': fileName,
    'declaredMime': declaredMime,
    'sizeBytes': sizeBytes,
  };
}

class UploadView {
  final AssetView asset;
  final int partSizeBytes;
  final int partCount;
  const UploadView({required this.asset, required this.partSizeBytes, required this.partCount});
  factory UploadView.fromJson(Map<String, dynamic> json) => UploadView(
    asset: AssetView.fromJson(json['asset'] as Map<String, dynamic>),
    partSizeBytes: json['partSizeBytes'] as int,
    partCount: json['partCount'] as int,
  );
  Map<String, dynamic> toJson() => {
    'asset': asset.toJson(),
    'partSizeBytes': partSizeBytes,
    'partCount': partCount,
  };
}

class SignPartsDto {
  final List<int> partNumbers;
  const SignPartsDto({required this.partNumbers});
  factory SignPartsDto.fromJson(Map<String, dynamic> json) => SignPartsDto(
    partNumbers: (json['partNumbers'] as List<dynamic>).map((e) => e as int).toList(),
  );
  Map<String, dynamic> toJson() => {
    'partNumbers': partNumbers.map((e) => e).toList(),
  };
}

class SignedPartView {
  final int partNumber;
  final String url;
  const SignedPartView({required this.partNumber, required this.url});
  factory SignedPartView.fromJson(Map<String, dynamic> json) => SignedPartView(
    partNumber: json['partNumber'] as int,
    url: json['url'] as String,
  );
  Map<String, dynamic> toJson() => {
    'partNumber': partNumber,
    'url': url,
  };
}

class SignedPartsView {
  final List<SignedPartView> parts;
  final String expiresAt;
  const SignedPartsView({required this.parts, required this.expiresAt});
  factory SignedPartsView.fromJson(Map<String, dynamic> json) => SignedPartsView(
    parts: (json['parts'] as List<dynamic>).map((e) => SignedPartView.fromJson(e as Map<String, dynamic>)).toList(),
    expiresAt: json['expiresAt'] as String,
  );
  Map<String, dynamic> toJson() => {
    'parts': parts.map((e) => e.toJson()).toList(),
    'expiresAt': expiresAt,
  };
}

class PartDto {
  final int partNumber;
  static const partNumberMinimum = 1;
  static const partNumberMaximum = 256;
  final String etag;
  static const etagMaxLength = 200;
  const PartDto({required this.partNumber, required this.etag});
  factory PartDto.fromJson(Map<String, dynamic> json) => PartDto(
    partNumber: json['partNumber'] as int,
    etag: json['etag'] as String,
  );
  Map<String, dynamic> toJson() => {
    'partNumber': partNumber,
    'etag': etag,
  };
}

class CompleteUploadDto {
  final List<PartDto> parts;
  const CompleteUploadDto({required this.parts});
  factory CompleteUploadDto.fromJson(Map<String, dynamic> json) => CompleteUploadDto(
    parts: (json['parts'] as List<dynamic>).map((e) => PartDto.fromJson(e as Map<String, dynamic>)).toList(),
  );
  Map<String, dynamic> toJson() => {
    'parts': parts.map((e) => e.toJson()).toList(),
  };
}

class DownloadView {
  final String url;
  final String expiresAt;
  const DownloadView({required this.url, required this.expiresAt});
  factory DownloadView.fromJson(Map<String, dynamic> json) => DownloadView(
    url: json['url'] as String,
    expiresAt: json['expiresAt'] as String,
  );
  Map<String, dynamic> toJson() => {
    'url': url,
    'expiresAt': expiresAt,
  };
}

class CreateShareDto {
  final String expiresAt;
  const CreateShareDto({required this.expiresAt});
  factory CreateShareDto.fromJson(Map<String, dynamic> json) => CreateShareDto(
    expiresAt: json['expiresAt'] as String,
  );
  Map<String, dynamic> toJson() => {
    'expiresAt': expiresAt,
  };
}

class CreatedShareView {
  final String id;
  final String expiresAt;
  final String? revokedAt;
  final String createdAt;
  final String url;
  const CreatedShareView({required this.id, required this.expiresAt, required this.revokedAt, required this.createdAt, required this.url});
  factory CreatedShareView.fromJson(Map<String, dynamic> json) => CreatedShareView(
    id: json['id'] as String,
    expiresAt: json['expiresAt'] as String,
    revokedAt: json['revokedAt'] == null ? null : json['revokedAt'] as String,
    createdAt: json['createdAt'] as String,
    url: json['url'] as String,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'expiresAt': expiresAt,
    'revokedAt': revokedAt,
    'createdAt': createdAt,
    'url': url,
  };
}

class ShareView {
  final String id;
  final String expiresAt;
  final String? revokedAt;
  final String createdAt;
  const ShareView({required this.id, required this.expiresAt, required this.revokedAt, required this.createdAt});
  factory ShareView.fromJson(Map<String, dynamic> json) => ShareView(
    id: json['id'] as String,
    expiresAt: json['expiresAt'] as String,
    revokedAt: json['revokedAt'] == null ? null : json['revokedAt'] as String,
    createdAt: json['createdAt'] as String,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'expiresAt': expiresAt,
    'revokedAt': revokedAt,
    'createdAt': createdAt,
  };
}

class SharesView {
  final List<ShareView> items;
  final String? nextCursor;
  const SharesView({required this.items, required this.nextCursor});
  factory SharesView.fromJson(Map<String, dynamic> json) => SharesView(
    items: (json['items'] as List<dynamic>).map((e) => ShareView.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String,
  );
  Map<String, dynamic> toJson() => {
    'items': items.map((e) => e.toJson()).toList(),
    'nextCursor': nextCursor,
  };
}

class BootstrapGuestDto {
  final String token;
  static const tokenMinLength = 43;
  static const tokenMaxLength = 43;
  const BootstrapGuestDto({required this.token});
  factory BootstrapGuestDto.fromJson(Map<String, dynamic> json) => BootstrapGuestDto(
    token: json['token'] as String,
  );
  Map<String, dynamic> toJson() => {
    'token': token,
  };
}

class GuestAccessView {
  final String expiresAt;
  const GuestAccessView({required this.expiresAt});
  factory GuestAccessView.fromJson(Map<String, dynamic> json) => GuestAccessView(
    expiresAt: json['expiresAt'] as String,
  );
  Map<String, dynamic> toJson() => {
    'expiresAt': expiresAt,
  };
}

class GuestVersionSummary {
  final String id;
  final int number;
  final String state;
  const GuestVersionSummary({required this.id, required this.number, required this.state});
  factory GuestVersionSummary.fromJson(Map<String, dynamic> json) => GuestVersionSummary(
    id: json['id'] as String,
    number: json['number'] as int,
    state: json['state'] as String,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'number': number,
    'state': state,
  };
}

class GuestProjectView {
  final String title;
  final String currency;
  final int balanceCents;
  final GuestVersionSummary currentVersion;
  const GuestProjectView({required this.title, required this.currency, required this.balanceCents, required this.currentVersion});
  factory GuestProjectView.fromJson(Map<String, dynamic> json) => GuestProjectView(
    title: json['title'] as String,
    currency: json['currency'] as String,
    balanceCents: json['balanceCents'] as int,
    currentVersion: GuestVersionSummary.fromJson(json['currentVersion'] as Map<String, dynamic>),
  );
  Map<String, dynamic> toJson() => {
    'title': title,
    'currency': currency,
    'balanceCents': balanceCents,
    'currentVersion': currentVersion.toJson(),
  };
}

class GuestVersionsView {
  final List<GuestVersionSummary> items;
  final String? nextCursor;
  const GuestVersionsView({required this.items, required this.nextCursor});
  factory GuestVersionsView.fromJson(Map<String, dynamic> json) => GuestVersionsView(
    items: (json['items'] as List<dynamic>).map((e) => GuestVersionSummary.fromJson(e as Map<String, dynamic>)).toList(),
    nextCursor: json['nextCursor'] == null ? null : json['nextCursor'] as String,
  );
  Map<String, dynamic> toJson() => {
    'items': items.map((e) => e.toJson()).toList(),
    'nextCursor': nextCursor,
  };
}

class GuestAssetView {
  final String id;
  final String fileName;
  final String mime;
  final String sizeBytes;
  const GuestAssetView({required this.id, required this.fileName, required this.mime, required this.sizeBytes});
  factory GuestAssetView.fromJson(Map<String, dynamic> json) => GuestAssetView(
    id: json['id'] as String,
    fileName: json['fileName'] as String,
    mime: json['mime'] as String,
    sizeBytes: json['sizeBytes'] as String,
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'fileName': fileName,
    'mime': mime,
    'sizeBytes': sizeBytes,
  };
}

class GuestVersionView {
  final String id;
  final int number;
  final String state;
  final List<GuestAssetView> assets;
  const GuestVersionView({required this.id, required this.number, required this.state, required this.assets});
  factory GuestVersionView.fromJson(Map<String, dynamic> json) => GuestVersionView(
    id: json['id'] as String,
    number: json['number'] as int,
    state: json['state'] as String,
    assets: (json['assets'] as List<dynamic>).map((e) => GuestAssetView.fromJson(e as Map<String, dynamic>)).toList(),
  );
  Map<String, dynamic> toJson() => {
    'id': id,
    'number': number,
    'state': state,
    'assets': assets.map((e) => e.toJson()).toList(),
  };
}

class GuestPreviewDto {
  final int page;
  static const pageMinimum = 1;
  static const pageMaximum = 100;
  const GuestPreviewDto({required this.page});
  factory GuestPreviewDto.fromJson(Map<String, dynamic> json) => GuestPreviewDto(
    page: json['page'] as int,
  );
  Map<String, dynamic> toJson() => {
    'page': page,
  };
}

class IdentityStatusView {
  final bool enabled;
  final bool verified;
  const IdentityStatusView({required this.enabled, required this.verified});
  factory IdentityStatusView.fromJson(Map<String, dynamic> json) => IdentityStatusView(
    enabled: json['enabled'] as bool,
    verified: json['verified'] as bool,
  );
  Map<String, dynamic> toJson() => {
    'enabled': enabled,
    'verified': verified,
  };
}

class IdentityRequestDto {
  final String email;
  static const emailMaxLength = 254;
  const IdentityRequestDto({required this.email});
  factory IdentityRequestDto.fromJson(Map<String, dynamic> json) => IdentityRequestDto(
    email: json['email'] as String,
  );
  Map<String, dynamic> toJson() => {
    'email': email,
  };
}

class IdentityRequestView {
  final String message;
  const IdentityRequestView({required this.message});
  factory IdentityRequestView.fromJson(Map<String, dynamic> json) => IdentityRequestView(
    message: json['message'] as String,
  );
  Map<String, dynamic> toJson() => {
    'message': message,
  };
}

class IdentityVerifyDto {
  final String code;
  const IdentityVerifyDto({required this.code});
  factory IdentityVerifyDto.fromJson(Map<String, dynamic> json) => IdentityVerifyDto(
    code: json['code'] as String,
  );
  Map<String, dynamic> toJson() => {
    'code': code,
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
    final path = '/api/v1/projects';
    final query = <String, String>{
      if (cursor != null) 'cursor': cursor.toString(),
      if (limit != null) 'limit': limit.toString(),
      if (search != null) 'search': search.toString(),
      if (status != null) 'status': status.toString(),
    };
    final target = query.isEmpty ? path : Uri(path: path, queryParameters: query).toString();
    final json = await transport('GET', target, null);
    return ProjectsView.fromJson(json as Map<String, dynamic>);
  }
  Future<ProjectView> projectscreate(CreateProjectDto body) async {
    final path = '/api/v1/projects';
    final json = await transport('POST', path, body.toJson());
    return ProjectView.fromJson(json as Map<String, dynamic>);
  }
  Future<ProjectView> projectsget(String id) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id.toString())}';
    final json = await transport('GET', path, null);
    return ProjectView.fromJson(json as Map<String, dynamic>);
  }
  Future<ProjectView> projectsarchive(EmptyDto body, String id) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id.toString())}/archive';
    final json = await transport('POST', path, body.toJson());
    return ProjectView.fromJson(json as Map<String, dynamic>);
  }
  Future<ClientsView> clientslist({String? cursor, int? limit, String? search}) async {
    final path = '/api/v1/clients';
    final query = <String, String>{
      if (cursor != null) 'cursor': cursor.toString(),
      if (limit != null) 'limit': limit.toString(),
      if (search != null) 'search': search.toString(),
    };
    final target = query.isEmpty ? path : Uri(path: path, queryParameters: query).toString();
    final json = await transport('GET', target, null);
    return ClientsView.fromJson(json as Map<String, dynamic>);
  }
  Future<ClientView> clientscreate(CreateClientDto body) async {
    final path = '/api/v1/clients';
    final json = await transport('POST', path, body.toJson());
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
  Future<PreviewStateView> filesscanRetry(EmptyDto body, String id) async {
    final path = '/api/v1/assets/${Uri.encodeComponent(id.toString())}/scan-retry';
    final json = await transport('POST', path, body.toJson());
    return PreviewStateView.fromJson(json as Map<String, dynamic>);
  }
  Future<PreviewStateView> filesmanualPreview(ManualPreviewDto body, String id) async {
    final path = '/api/v1/assets/${Uri.encodeComponent(id.toString())}/manual-preview';
    final json = await transport('POST', path, body.toJson());
    return PreviewStateView.fromJson(json as Map<String, dynamic>);
  }
  Future<PreviewStateView> filesremoveManualPreview(EmptyDto body, String id) async {
    final path = '/api/v1/assets/${Uri.encodeComponent(id.toString())}/manual-preview';
    final json = await transport('DELETE', path, body.toJson());
    return PreviewStateView.fromJson(json as Map<String, dynamic>);
  }
  Future<PreviewStateView> filespreviewStatus(String id) async {
    final path = '/api/v1/assets/${Uri.encodeComponent(id.toString())}/preview-status';
    final json = await transport('GET', path, null);
    return PreviewStateView.fromJson(json as Map<String, dynamic>);
  }
  Future<PreviewView> filespreview(PreviewPageDto body, String id) async {
    final path = '/api/v1/assets/${Uri.encodeComponent(id.toString())}/preview';
    final json = await transport('POST', path, body.toJson());
    return PreviewView.fromJson(json as Map<String, dynamic>);
  }
  Future<PreviewStateView> filespreviewRetry(EmptyDto body, String id) async {
    final path = '/api/v1/assets/${Uri.encodeComponent(id.toString())}/preview-retry';
    final json = await transport('POST', path, body.toJson());
    return PreviewStateView.fromJson(json as Map<String, dynamic>);
  }
  Future<StorageView> filesstorage() async {
    final path = '/api/v1/storage';
    final json = await transport('GET', path, null);
    return StorageView.fromJson(json as Map<String, dynamic>);
  }
  Future<VersionsView> filesversions(String id, {String? cursor, int? limit, String? search}) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id.toString())}/versions';
    final query = <String, String>{
      if (cursor != null) 'cursor': cursor.toString(),
      if (limit != null) 'limit': limit.toString(),
      if (search != null) 'search': search.toString(),
    };
    final target = query.isEmpty ? path : Uri(path: path, queryParameters: query).toString();
    final json = await transport('GET', target, null);
    return VersionsView.fromJson(json as Map<String, dynamic>);
  }
  Future<VersionView> filescreateVersion(EmptyDto body, String id) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id.toString())}/versions';
    final json = await transport('POST', path, body.toJson());
    return VersionView.fromJson(json as Map<String, dynamic>);
  }
  Future<VersionView> filespublish(PublishVersionDto body, String id) async {
    final path = '/api/v1/versions/${Uri.encodeComponent(id.toString())}/publish';
    final json = await transport('POST', path, body.toJson());
    return VersionView.fromJson(json as Map<String, dynamic>);
  }
  Future<UploadView> filesstart(StartUploadDto body, String id) async {
    final path = '/api/v1/versions/${Uri.encodeComponent(id.toString())}/uploads';
    final json = await transport('POST', path, body.toJson());
    return UploadView.fromJson(json as Map<String, dynamic>);
  }
  Future<AssetView> filesgetUpload(String id) async {
    final path = '/api/v1/uploads/${Uri.encodeComponent(id.toString())}';
    final json = await transport('GET', path, null);
    return AssetView.fromJson(json as Map<String, dynamic>);
  }
  Future<AssetView> filesabort(EmptyDto body, String id) async {
    final path = '/api/v1/uploads/${Uri.encodeComponent(id.toString())}';
    final json = await transport('DELETE', path, body.toJson());
    return AssetView.fromJson(json as Map<String, dynamic>);
  }
  Future<SignedPartsView> filesparts(SignPartsDto body, String id) async {
    final path = '/api/v1/uploads/${Uri.encodeComponent(id.toString())}/parts';
    final json = await transport('POST', path, body.toJson());
    return SignedPartsView.fromJson(json as Map<String, dynamic>);
  }
  Future<AssetView> filescomplete(CompleteUploadDto body, String id) async {
    final path = '/api/v1/uploads/${Uri.encodeComponent(id.toString())}/complete';
    final json = await transport('POST', path, body.toJson());
    return AssetView.fromJson(json as Map<String, dynamic>);
  }
  Future<DownloadView> filesdownload(EmptyDto body, String id) async {
    final path = '/api/v1/assets/${Uri.encodeComponent(id.toString())}/download';
    final json = await transport('POST', path, body.toJson());
    return DownloadView.fromJson(json as Map<String, dynamic>);
  }
  Future<CreatedShareView> sharingcreate(CreateShareDto body, String id) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id.toString())}/shares';
    final json = await transport('POST', path, body.toJson());
    return CreatedShareView.fromJson(json as Map<String, dynamic>);
  }
  Future<SharesView> sharinglist(String id, {String? cursor, int? limit, String? search}) async {
    final path = '/api/v1/projects/${Uri.encodeComponent(id.toString())}/shares';
    final query = <String, String>{
      if (cursor != null) 'cursor': cursor.toString(),
      if (limit != null) 'limit': limit.toString(),
      if (search != null) 'search': search.toString(),
    };
    final target = query.isEmpty ? path : Uri(path: path, queryParameters: query).toString();
    final json = await transport('GET', target, null);
    return SharesView.fromJson(json as Map<String, dynamic>);
  }
  Future<void> sharingrevoke(EmptyDto body, String id) async {
    final path = '/api/v1/shares/${Uri.encodeComponent(id.toString())}';
    await transport('DELETE', path, body.toJson());
  }
  Future<GuestAccessView> guestbootstrap(BootstrapGuestDto body) async {
    final path = '/api/v1/guest/bootstrap';
    final json = await transport('POST', path, body.toJson());
    return GuestAccessView.fromJson(json as Map<String, dynamic>);
  }
  Future<void> guestlogout(EmptyDto body) async {
    final path = '/api/v1/guest/logout';
    await transport('POST', path, body.toJson());
  }
  Future<GuestProjectView> guestproject() async {
    final path = '/api/v1/guest/project';
    final json = await transport('GET', path, null);
    return GuestProjectView.fromJson(json as Map<String, dynamic>);
  }
  Future<GuestVersionsView> guestversions({String? cursor, int? limit, String? search}) async {
    final path = '/api/v1/guest/versions';
    final query = <String, String>{
      if (cursor != null) 'cursor': cursor.toString(),
      if (limit != null) 'limit': limit.toString(),
      if (search != null) 'search': search.toString(),
    };
    final target = query.isEmpty ? path : Uri(path: path, queryParameters: query).toString();
    final json = await transport('GET', target, null);
    return GuestVersionsView.fromJson(json as Map<String, dynamic>);
  }
  Future<GuestVersionView> guestversion(String id) async {
    final path = '/api/v1/guest/versions/${Uri.encodeComponent(id.toString())}';
    final json = await transport('GET', path, null);
    return GuestVersionView.fromJson(json as Map<String, dynamic>);
  }
  Future<PreviewStateView> gueststatus(String id) async {
    final path = '/api/v1/guest/assets/${Uri.encodeComponent(id.toString())}/preview-status';
    final json = await transport('GET', path, null);
    return PreviewStateView.fromJson(json as Map<String, dynamic>);
  }
  Future<PreviewView> guestpreview(GuestPreviewDto body, String id) async {
    final path = '/api/v1/guest/assets/${Uri.encodeComponent(id.toString())}/preview';
    final json = await transport('POST', path, body.toJson());
    return PreviewView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityStatusView> identitystatus() async {
    final path = '/api/v1/guest/identity';
    final json = await transport('GET', path, null);
    return IdentityStatusView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityRequestView> identityrequest(IdentityRequestDto body) async {
    final path = '/api/v1/guest/identity/request';
    final json = await transport('POST', path, body.toJson());
    return IdentityRequestView.fromJson(json as Map<String, dynamic>);
  }
  Future<IdentityStatusView> identityverify(IdentityVerifyDto body) async {
    final path = '/api/v1/guest/identity/verify';
    final json = await transport('POST', path, body.toJson());
    return IdentityStatusView.fromJson(json as Map<String, dynamic>);
  }
}
