import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/session.dart';
import '../generated/api.g.dart';
import 'auth_repository.dart';
import 'client_factory.dart';

abstract interface class ApprovalsRepository {
  Future<ApprovalStatusView> status(String versionId, {required bool guest});
  Future<ApprovalView> approve(String versionId, String key);
}

final approvalsRepositoryProvider = Provider<ApprovalsRepository>((ref) {
  final creator = (ref.watch(authRepositoryProvider) as HttpAuthRepository).api;
  final client = createHttpClient();
  ref.onDispose(client.close);
  final guest = HttpAuthRepository(
    client,
    Uri.parse(const String.fromEnvironment('API_ORIGIN', defaultValue: '')),
  ).api;
  return HttpApprovalsRepository(creator, guest);
});

class HttpApprovalsRepository implements ApprovalsRepository {
  final CofreClient creator;
  final CofreClient guestApi;
  const HttpApprovalsRepository(this.creator, this.guestApi);
  @override
  Future<ApprovalStatusView> status(String versionId, {required bool guest}) =>
      guest
      ? guestApi.approvalsguest(versionId)
      : creator.approvalscreator(versionId);
  @override
  Future<ApprovalView> approve(String versionId, String key) =>
      guestApi.approvalscreate(
        CreateApprovalDto(versionId: versionId, confirmed: true),
        idempotencyKey: key,
      );
}
