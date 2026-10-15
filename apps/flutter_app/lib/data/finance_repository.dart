import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/session.dart';
import '../generated/api.g.dart';
import 'auth_repository.dart';
import 'client_factory.dart';

abstract interface class FinanceRepository {
  Future<FinanceView> load(String projectId);
  Future<FinanceView> settle(
    String projectId,
    ManualSettlementDto input,
    String key,
  );
  Future<DownloadView> download(String assetId);
}

final financeRepositoryProvider = Provider<FinanceRepository>((ref) {
  final creator = (ref.watch(authRepositoryProvider) as HttpAuthRepository).api;
  final client = createHttpClient();
  ref.onDispose(client.close);
  final guest = HttpAuthRepository(
    client,
    Uri.parse(const String.fromEnvironment('API_ORIGIN', defaultValue: '')),
  ).api;
  return HttpFinanceRepository(creator, guest);
});

class HttpFinanceRepository implements FinanceRepository {
  final CofreClient creator;
  final CofreClient guest;
  const HttpFinanceRepository(this.creator, this.guest);
  @override
  Future<FinanceView> load(String projectId) => creator.financeget(projectId);
  @override
  Future<FinanceView> settle(
    String projectId,
    ManualSettlementDto input,
    String key,
  ) => creator.financesettle(input, projectId, idempotencyKey: key);
  @override
  Future<DownloadView> download(String assetId) =>
      guest.financedownload(const EmptyDto(), assetId);
}
