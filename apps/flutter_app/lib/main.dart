import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'application/session.dart';
import 'presentation/screens.dart';
import 'presentation/guest_portal.dart';

void main() => runApp(const ProviderScope(child: CofreApp()));

final routerProvider = Provider<GoRouter>((ref) {
  final refresh = ValueNotifier<int>(0);
  ref.listen(sessionProvider, (_, __) {
    refresh.value++;
  });
  final router = GoRouter(
    initialLocation: '/',
    refreshListenable: refresh,
    redirect: (_, route) {
      if (route.matchedLocation == '/portal' ||
          route.matchedLocation.startsWith('/s/'))
        return null;
      final phase = ref.read(sessionProvider).phase;
      final path = route.matchedLocation;
      if (phase == SessionPhase.checking || phase == SessionPhase.failed) {
        return path == '/' ? null : '/';
      }
      if (phase == SessionPhase.signedOut) {
        return path == '/login' || path == '/cadastro' ? null : '/login';
      }
      return path == '/dashboard' ? null : '/dashboard';
    },
    routes: [
      GoRoute(
        path: '/s/:token',
        builder: (_, route) =>
            GuestEntryScreen(token: route.pathParameters['token']!),
      ),
      GoRoute(path: '/portal', builder: (_, __) => const GuestPortalScreen()),
      GoRoute(path: '/', builder: (_, __) => const SplashScreen()),
      GoRoute(
        path: '/login',
        builder: (_, __) => const AuthScreen(register: false),
      ),
      GoRoute(
        path: '/cadastro',
        builder: (_, __) => const AuthScreen(register: true),
      ),
      GoRoute(path: '/dashboard', builder: (_, __) => const DashboardScreen()),
    ],
  );
  ref.onDispose(() {
    router.dispose();
    refresh.dispose();
  });
  return router;
});

class CofreApp extends ConsumerWidget {
  const CofreApp({super.key});
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(sessionProvider);
    return MaterialApp.router(
      title: 'Cofre de Entregáveis',
      debugShowCheckedModeBanner: false,
      locale: const Locale('pt', 'BR'),
      supportedLocales: const [Locale('pt', 'BR')],
      localizationsDelegates: GlobalMaterialLocalizations.delegates,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF173D35)),
        scaffoldBackgroundColor: const Color(0xFFF6F5F0),
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(minimumSize: const Size(48, 52)),
        ),
      ),
      routerConfig: ref.watch(routerProvider),
    );
  }
}
