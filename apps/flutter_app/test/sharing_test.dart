import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/data/sharing_repository.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/application/session.dart';
import 'package:cofre_app/generated/api.g.dart';
import 'package:cofre_app/main.dart';
import 'package:cofre_app/presentation/sharing.dart';

import 'app_test.dart' as auth;

class FakeSharing implements SharingRepository {
  final items = <ShareView>[];
  bool fail = false;
  @override
  Future<SharesView> list(String projectId, {String? cursor}) async =>
      SharesView(items: List.of(items), nextCursor: null);
  @override
  Future<CreatedShareView> create(String projectId, DateTime expiry) async {
    if (fail)
      throw const ApiFailure(409, 'Publique uma versão antes de compartilhar.');
    final result = CreatedShareView(
      id: 'share-1',
      expiresAt: expiry.toUtc().toIso8601String(),
      revokedAt: null,
      createdAt: DateTime.now().toUtc().toIso8601String(),
      url: 'https://example.test/#/s/secret',
    );
    items.add(ShareView.fromJson(result.toJson()));
    return result;
  }

  @override
  Future<void> revoke(String id) async {
    items[0] = ShareView.fromJson({
      ...items[0].toJson(),
      'revokedAt': DateTime.now().toUtc().toIso8601String(),
    });
  }
}

class FakeGuest implements GuestRepository {
  bool identityEnabled = false;
  bool identityVerified = false;
  bool failIdentity = false;
  final identityEmails = <String>[];
  final identityCodes = <String>[];
  @override
  Future<IdentityStatusView> identityStatus() async =>
      IdentityStatusView(enabled: identityEnabled, verified: identityVerified);
  @override
  Future<IdentityRequestView> requestIdentity(String email) async {
    if (failIdentity) throw const ApiFailure(503, 'Envio indisponível.');
    identityEmails.add(email);
    return const IdentityRequestView(
      message: 'Se o e-mail corresponder ao cadastro, você receberá um código.',
    );
  }

  @override
  Future<IdentityStatusView> verifyIdentity(String code) async {
    identityCodes.add(code);
    if (code != '012345')
      throw const ApiFailure(400, 'Código inválido ou expirado.');
    identityVerified = true;
    return IdentityStatusView(enabled: identityEnabled, verified: true);
  }

  final tokens = <String>[];
  bool denied = false;
  bool ended = false;
  bool failBootstrap = false;
  void Function()? onBootstrap;
  final statuses = <String>[];
  @override
  Future<void> bootstrap(String token) async {
    tokens.add(token);
    onBootstrap?.call();
    if (failBootstrap) throw const ApiFailure(401, 'Acesso indisponível.');
  }

  void check() {
    if (denied || ended) throw const ApiFailure(401, 'Acesso indisponível.');
  }

  @override
  Future<GuestProjectView> project() async {
    check();
    return const GuestProjectView(
      title: 'Projeto compartilhado',
      currency: 'BRL',
      balanceCents: 1200,
      currentVersion: GuestVersionSummary(
        id: 'v2',
        number: 2,
        state: 'PUBLISHED',
      ),
    );
  }

  @override
  Future<GuestVersionsView> versions({String? cursor}) async {
    check();
    return const GuestVersionsView(
      items: [
        GuestVersionSummary(id: 'v2', number: 2, state: 'PUBLISHED'),
        GuestVersionSummary(id: 'v1', number: 1, state: 'SUPERSEDED'),
      ],
      nextCursor: null,
    );
  }

  @override
  Future<GuestVersionView> version(String id) async {
    check();
    return GuestVersionView(
      id: id,
      number: id == 'v2' ? 2 : 1,
      state: id == 'v2' ? 'PUBLISHED' : 'SUPERSEDED',
      assets: [
        GuestAssetView(
          id: id,
          fileName: id == 'v2' ? 'Entrega.zip' : 'Histórico.zip',
          mime: 'application/zip',
          sizeBytes: '10',
        ),
      ],
    );
  }

  @override
  Future<PreviewStateView> status(String id) async {
    check();
    statuses.add(id);
    return const PreviewStateView(
      state: 'UNSUPPORTED',
      pages: 0,
      failureCode: null,
    );
  }

  @override
  Future<PreviewView> preview(String id, int page) async {
    throw StateError('Original cannot be used');
  }

  @override
  Future<void> logout() async {
    ended = true;
  }
}

void main() {
  String? copied;
  Future<void> sharing(
    WidgetTester tester,
    FakeSharing repo,
    double width,
  ) async {
    copied = null;
    tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
      SystemChannels.platform,
      (call) async {
        if (call.method == 'Clipboard.setData')
          copied = (call.arguments as Map)['text'] as String;
        return null;
      },
    );
    addTearDown(
      () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
        SystemChannels.platform,
        null,
      ),
    );
    tester.view.physicalSize = Size(width, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [sharingRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => const SharingDialog(projectId: 'p'),
                ),
                child: const Text('Compartilhar'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Compartilhar'));
    await tester.pumpAndSettle();
  }

  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets('link mostrado uma vez, copiado e revogado em $width px', (
      tester,
    ) async {
      final repo = FakeSharing();
      await sharing(tester, repo, width);
      await tester.tap(find.text('Criar link'));
      await tester.pumpAndSettle();
      expect(find.text('https://example.test/#/s/secret'), findsOneWidget);
      await tester.tap(find.text('Copiar link'));
      await tester.pumpAndSettle();
      expect(copied, 'https://example.test/#/s/secret');
      expect(find.text('Link copiado.'), findsOneWidget);
      await tester.tap(find.text('Fechar'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Compartilhar'));
      await tester.pumpAndSettle();
      expect(find.text('https://example.test/#/s/secret'), findsNothing);
      await tester.tap(find.text('Revogar link'));
      await tester.pumpAndSettle();
      expect(repo.items.single.revokedAt, isNotNull);
      expect(find.text('Revogado'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('projeto sem publicação mostra orientação e não inventa link', (
    tester,
  ) async {
    await sharing(tester, FakeSharing()..fail = true, 360);
    await tester.tap(find.text('Criar link'));
    await tester.pumpAndSettle();
    expect(
      find.text('Publique uma versão antes de compartilhar.'),
      findsOneWidget,
    );
    expect(find.text('Copiar link'), findsNothing);
  });

  Future<ProviderContainer> portal(
    WidgetTester tester,
    FakeGuest repo,
    double width,
  ) async {
    tester.view.physicalSize = Size(width, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          authRepositoryProvider.overrideWithValue(auth.FakeAuth()),
          guestRepositoryProvider.overrideWithValue(repo),
        ],
        child: const CofreApp(),
      ),
    );
    await tester.pumpAndSettle();
    return ProviderScope.containerOf(tester.element(find.byType(CofreApp)));
  }

  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets(
      'portal remove token antes do bootstrap e mostra prévias e pedido condicionado do original em $width px',
      (tester) async {
        final repo = FakeGuest();
        final container = await portal(tester, repo, width);
        final router = container.read(routerProvider);
        repo.onBootstrap = () =>
            expect(router.routeInformationProvider.value.uri.path, '/portal');
        final updates = <Map<dynamic, dynamic>>[];
        tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
          SystemChannels.navigation,
          (call) async {
            if (call.method == 'routeInformationUpdated')
              updates.add(call.arguments as Map<dynamic, dynamic>);
            return null;
          },
        );
        addTearDown(
          () => tester.binding.defaultBinaryMessenger.setMockMethodCallHandler(
            SystemChannels.navigation,
            null,
          ),
        );
        router.go('/s/${'A' * 43}');
        await tester.pumpAndSettle();
        expect(repo.tokens.single, 'A' * 43);
        expect(container.read(guestTicketProvider).token, isNull);
        expect(router.routeInformationProvider.value.uri.path, '/portal');
        expect(
          updates.any(
            (u) =>
                (u['uri'] as String?)?.contains('/portal') == true &&
                u['replace'] == true,
          ),
          isTrue,
        );
        expect(updates.last.toString().contains('A' * 43), isFalse);
        expect(find.text('Projeto compartilhado'), findsOneWidget);
        expect(find.text('Entrega.zip'), findsOneWidget);
        expect(find.text('Baixar original'), findsOneWidget);
        expect(find.text('Publicar versão'), findsNothing);
        expect(find.text('Enviar arquivo'), findsNothing);
        await tester.ensureVisible(find.text('Ver prévia'));
        await tester.tap(find.text('Ver prévia'));
        await tester.pumpAndSettle();
        expect(repo.statuses, ['v2']);
        expect(find.text('Reprocessar prévia'), findsNothing);
        expect(
          find.text('Este formato ainda não tem prévia automática.'),
          findsOneWidget,
        );
        await tester.tap(find.text('Fechar'));
        await tester.pumpAndSettle();
        await tester.tap(find.byType(DropdownButtonFormField<String>));
        await tester.pumpAndSettle();
        await tester.tap(find.text('V1 • Histórico').last);
        await tester.pumpAndSettle();
        expect(find.text('Histórico.zip'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'revogação remove dados na atualização e encerramento não exige login de criador',
    (tester) async {
      final repo = FakeGuest();
      final container = await portal(tester, repo, 360);
      container.read(routerProvider).go('/portal');
      await tester.pumpAndSettle();
      expect(repo.tokens, isEmpty);
      expect(find.text('Projeto compartilhado'), findsOneWidget);
      repo.denied = true;
      await tester.ensureVisible(find.text('Atualizar projeto'));
      await tester.tap(find.text('Atualizar projeto'));
      await tester.pumpAndSettle();
      expect(find.text('Projeto compartilhado'), findsNothing);
      expect(find.text('Entrega.zip'), findsNothing);
      expect(find.text('Acesso indisponível.'), findsOneWidget);
      await tester.tap(find.text('Encerrar acesso'));
      await tester.pumpAndSettle();
      expect(repo.ended, isTrue);
      expect(find.textContaining('Acesso encerrado.'), findsOneWidget);
    },
  );
  testWidgets(
    'bootstrap inválido não restaura sessão anterior nem mantém segredo na rota',
    (tester) async {
      final repo = FakeGuest()..failBootstrap = true;
      final container = await portal(tester, repo, 360);
      container.read(routerProvider).go('/s/${'B' * 43}');
      await tester.pumpAndSettle();
      expect(find.text('Acesso indisponível.'), findsOneWidget);
      expect(find.text('Projeto compartilhado'), findsNothing);
      expect(
        container.read(routerProvider).routeInformationProvider.value.uri.path,
        '/portal',
      );
      expect(container.read(guestTicketProvider).token, isNull);
    },
  );
}
