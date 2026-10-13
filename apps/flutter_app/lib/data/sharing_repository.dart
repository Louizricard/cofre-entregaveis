import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/session.dart';
import '../generated/api.g.dart';
import 'auth_repository.dart';
import 'client_factory.dart';

abstract interface class SharingRepository {
  Future<SharesView> list(String projectId, {String? cursor});
  Future<CreatedShareView> create(String projectId, DateTime expiresAt);
  Future<void> revoke(String id);
}

final sharingRepositoryProvider = Provider<SharingRepository>(
  (ref) => HttpSharingRepository(
    (ref.watch(authRepositoryProvider) as HttpAuthRepository).api,
  ),
);

class HttpSharingRepository implements SharingRepository {
  final CofreClient api;
  const HttpSharingRepository(this.api);
  @override
  Future<SharesView> list(String projectId, {String? cursor}) =>
      api.sharinglist(projectId, cursor: cursor);
  @override
  Future<CreatedShareView> create(String projectId, DateTime expiresAt) =>
      api.sharingcreate(
        CreateShareDto(expiresAt: expiresAt.toUtc().toIso8601String()),
        projectId,
      );
  @override
  Future<void> revoke(String id) => api.sharingrevoke(const EmptyDto(), id);
}

abstract interface class GuestRepository {
  Future<void> bootstrap(String token);
  Future<GuestProjectView> project();
  Future<GuestVersionsView> versions({String? cursor});
  Future<GuestVersionView> version(String id);
  Future<PreviewStateView> status(String id);
  Future<PreviewView> preview(String id, int page);
  Future<void> logout();
}

final guestRepositoryProvider = Provider<GuestRepository>((ref) {
  final client = createHttpClient();
  ref.onDispose(client.close);
  final transport = HttpAuthRepository(
    client,
    Uri.parse(const String.fromEnvironment('API_ORIGIN', defaultValue: '')),
  );
  return HttpGuestRepository(transport.api);
});

class HttpGuestRepository implements GuestRepository {
  final CofreClient api;
  const HttpGuestRepository(this.api);
  @override
  Future<void> bootstrap(String token) async {
    await api.guestlogout(const EmptyDto());
    await api.guestbootstrap(BootstrapGuestDto(token: token));
  }

  @override
  Future<GuestProjectView> project() => api.guestproject();
  @override
  Future<GuestVersionsView> versions({String? cursor}) =>
      api.guestversions(cursor: cursor);
  @override
  Future<GuestVersionView> version(String id) => api.guestversion(id);
  @override
  Future<PreviewStateView> status(String id) => api.gueststatus(id);
  @override
  Future<PreviewView> preview(String id, int page) =>
      api.guestpreview(GuestPreviewDto(page: page), id);
  @override
  Future<void> logout() => api.guestlogout(const EmptyDto());
}

// Only in memory while replacing the secret route. Never stored in browser history or storage.
class GuestTicket {
  String? token;
  String? take() {
    final value = token;
    token = null;
    return value;
  }
}

final guestTicketProvider = Provider<GuestTicket>((ref) => GuestTicket());
