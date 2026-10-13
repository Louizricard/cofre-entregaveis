import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/auth_repository.dart';
import '../data/client_factory.dart';
import '../generated/api.g.dart';

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  final client = createHttpClient();
  ref.onDispose(client.close);
  final base = Uri.parse(
    const String.fromEnvironment('API_ORIGIN', defaultValue: ''),
  );
  return HttpAuthRepository(client, base);
});

enum SessionPhase { checking, signedOut, signedIn, failed }

class SessionState {
  final SessionPhase phase;
  final IdentityView? identity;
  final String? error;
  const SessionState(this.phase, {this.identity, this.error});
}

final sessionProvider = NotifierProvider<SessionController, SessionState>(
  SessionController.new,
);

class SessionController extends Notifier<SessionState> {
  @override
  SessionState build() {
    final repo = ref.read(authRepositoryProvider);
    if (repo is HttpAuthRepository) {
      repo.onUnauthorized = () {
        state = const SessionState(SessionPhase.signedOut);
      };
      ref.onDispose(() {
        repo.onUnauthorized = null;
      });
    }
    Future.microtask(restore);
    return const SessionState(SessionPhase.checking);
  }

  Future<void> restore() async {
    state = const SessionState(SessionPhase.checking);
    try {
      final identity = await ref.read(authRepositoryProvider).me();
      state = SessionState(SessionPhase.signedIn, identity: identity);
    } on ApiFailure catch (e) {
      state = e.status == 401
          ? const SessionState(SessionPhase.signedOut)
          : SessionState(SessionPhase.failed, error: e.message);
    } catch (_) {
      state = const SessionState(
        SessionPhase.failed,
        error: 'Não foi possível verificar sua sessão.',
      );
    }
  }

  Future<void> login(LoginDto input) async {
    final identity = await ref.read(authRepositoryProvider).login(input);
    state = SessionState(SessionPhase.signedIn, identity: identity);
  }

  Future<void> register(RegisterDto input) async {
    final identity = await ref.read(authRepositoryProvider).register(input);
    state = SessionState(SessionPhase.signedIn, identity: identity);
  }

  Future<void> logout() async {
    await ref.read(authRepositoryProvider).logout();
    state = const SessionState(SessionPhase.signedOut);
  }
}
