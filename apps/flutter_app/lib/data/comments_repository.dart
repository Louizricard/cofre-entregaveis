import 'dart:math';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/session.dart';
import '../generated/api.g.dart';
import 'auth_repository.dart';
import 'client_factory.dart';

abstract interface class CommentsRepository {
  Future<CommentsView> list(
    String assetId, {
    required bool guest,
    String? cursor,
  });
  Future<CommentView> create(CreateCommentDto input);
}

final commentsRepositoryProvider = Provider<CommentsRepository>((ref) {
  final creator = (ref.watch(authRepositoryProvider) as HttpAuthRepository).api;
  final client = createHttpClient();
  ref.onDispose(client.close);
  final guest = HttpAuthRepository(
    client,
    Uri.parse(const String.fromEnvironment('API_ORIGIN', defaultValue: '')),
  ).api;
  return HttpCommentsRepository(creator, guest);
});

class HttpCommentsRepository implements CommentsRepository {
  final CofreClient creator;
  final CofreClient guestApi;
  const HttpCommentsRepository(this.creator, this.guestApi);
  @override
  Future<CommentsView> list(
    String assetId, {
    required bool guest,
    String? cursor,
  }) => guest
      ? guestApi.commentsguest(assetId, cursor: cursor)
      : creator.commentscreator(assetId, cursor: cursor);
  @override
  Future<CommentView> create(CreateCommentDto input) =>
      guestApi.commentscreate(input);
}

String newCommentRequestId() {
  final random = Random.secure();
  final bytes = List<int>.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((v) => v.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}
