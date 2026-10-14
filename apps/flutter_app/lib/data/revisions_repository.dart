import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/session.dart';
import '../generated/api.g.dart';
import 'auth_repository.dart';
import 'client_factory.dart';

abstract interface class RevisionsRepository {
  Future<RevisionsView> list(String projectId, {required bool guest});
  Future<RevisionRoundView> request(RequestRevisionDto input, String key);
  Future<RevisionRoundView> decide(String id, DecideRevisionDto input);
}

final revisionsRepositoryProvider = Provider<RevisionsRepository>((ref) {
  final creator = (ref.watch(authRepositoryProvider) as HttpAuthRepository).api;
  final client = createHttpClient();
  ref.onDispose(client.close);
  final guest = HttpAuthRepository(
    client,
    Uri.parse(const String.fromEnvironment('API_ORIGIN', defaultValue: '')),
  ).api;
  return HttpRevisionsRepository(creator, guest);
});

class HttpRevisionsRepository implements RevisionsRepository {
  final CofreClient creator;
  final CofreClient guestApi;
  const HttpRevisionsRepository(this.creator, this.guestApi);
  @override
  Future<RevisionsView> list(String projectId, {required bool guest}) =>
      guest ? guestApi.revisionsguest() : creator.revisionscreator(projectId);
  @override
  Future<RevisionRoundView> request(RequestRevisionDto input, String key) =>
      guestApi.revisionsrequest(input, idempotencyKey: key);
  @override
  Future<RevisionRoundView> decide(String id, DecideRevisionDto input) =>
      creator.revisionsdecide(input, id);
}
