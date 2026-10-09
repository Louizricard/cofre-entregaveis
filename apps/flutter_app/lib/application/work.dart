import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../generated/api.g.dart';
import '../data/work_repository.dart';
import 'session.dart';

final workRepositoryProvider = Provider<WorkRepository>((ref) {
  final auth = ref.watch(authRepositoryProvider);
  if (auth is! HttpAuthRepository)
    throw StateError('Configure WorkRepository no ambiente de teste.');
  return HttpWorkRepository(auth.api);
});

int? parseBrlCents(String text) {
  final value = text.trim();
  if (!RegExp(r'^\d{1,8}(,\d{1,2})?$').hasMatch(value)) return null;
  final parts = value.split(',');
  final cents =
      int.parse(parts[0]) * 100 +
      (parts.length == 1 ? 0 : int.parse(parts[1].padRight(2, '0')));
  return cents <= ProjectDto.balanceCentsMaximum ? cents : null;
}

String brlInput(int cents) =>
    '${cents ~/ 100},${(cents % 100).toString().padLeft(2, '0')}';
String brlLabel(int cents) => 'R\$ ${brlInput(cents)}';
