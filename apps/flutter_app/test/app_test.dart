import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cofre_app/main.dart';
import 'package:cofre_app/application/work.dart';

import 'fake_work.dart';

import 'package:cofre_app/application/session.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/generated/api.g.dart';

const identity = IdentityView(
  user: UserView(id: 'user-a', name: 'Ana', email: 'ana@example.com'),
  workspace: WorkspaceView(id: 'workspace-a', name: 'Studio Ana'),
);

class FakeAuth implements AuthRepository {
  bool signedIn;
  bool failLogin = false;
  bool failRestore = false;
  bool failLogout = false;
  int registrations = 0;
  FakeAuth({this.signedIn = false});
  @override
  Future<IdentityView> me() async {
    if (failRestore) throw const ApiFailure(0, 'Sem conexão');
    if (!signedIn) throw const ApiFailure(401, 'Sessão inválida');
    return identity;
  }

  @override
  Future<IdentityView> login(LoginDto input) async {
    if (failLogin) throw const ApiFailure(401, 'E-mail ou senha inválidos.');
    signedIn = true;
    return identity;
  }

  @override
  Future<IdentityView> register(RegisterDto input) async {
    registrations++;
    signedIn = true;
    return identity;
  }

  @override
  Future<void> logout() async {
    if (failLogout) throw const ApiFailure(0, 'Sem conexão');
    signedIn = false;
  }

  @override
  Future<ProjectsView> projects() async =>
      const ProjectsView(items: [], nextCursor: null);
}

Future<void> mount(
  WidgetTester tester,
  FakeAuth repo, {
  double width = 768,
  FakeWork? work,
}) async {
  tester.view.physicalSize = Size(width, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        authRepositoryProvider.overrideWithValue(repo),
        workRepositoryProvider.overrideWithValue(work ?? FakeWork()),
      ],
      child: const CofreApp(),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets(
      'login, validação e dashboard sem overflow em ${width.toInt()} px',
      (tester) async {
        final repo = FakeAuth();
        await mount(tester, repo, width: width);
        final button = find.widgetWithText(FilledButton, 'Entrar');
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pumpAndSettle();
        expect(find.text('Informe um e-mail válido.'), findsOneWidget);
        expect(find.text('Use de 12 a 128 caracteres.'), findsOneWidget);
        await tester.enterText(
          find.byType(TextFormField).at(0),
          'ana@example.com',
        );
        await tester.enterText(
          find.byType(TextFormField).at(1),
          'senha-segura-123',
        );
        await tester.ensureVisible(button);
        await tester.tap(button);
        await tester.pumpAndSettle();
        expect(find.text('Studio Ana'), findsOneWidget);
        expect(find.text('Um novo começo.'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await tester.tap(find.text('Sair'));
        await tester.pumpAndSettle();
        expect(find.text('Seu espaço, de volta.'), findsOneWidget);
      },
    );
  }

  testWidgets('cadastro valida nomes e navega após sucesso', (tester) async {
    final repo = FakeAuth();
    await mount(tester, repo, width: 360);
    await tester.tap(find.text('Criar uma conta'));
    await tester.pumpAndSettle();
    final button = find.widgetWithText(FilledButton, 'Criar conta');
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(find.text('Use de 1 a 120 caracteres.'), findsNWidgets(2));
    final fields = find.byType(TextFormField);
    await tester.enterText(fields.at(0), 'Ana');
    await tester.enterText(fields.at(1), 'Studio Ana');
    await tester.enterText(fields.at(2), 'ana@example.com');
    await tester.enterText(fields.at(3), 'senha-segura-123');
    await tester.ensureVisible(button);
    await tester.tap(button);
    await tester.pumpAndSettle();
    expect(repo.registrations, 1);
    expect(find.text('Studio Ana'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });

  testWidgets('restaura sessão por me e protege navegação após 401', (
    tester,
  ) async {
    final repo = FakeAuth(signedIn: true);
    await mount(tester, repo);
    expect(find.text('Studio Ana'), findsOneWidget);
    final element = tester.element(find.byType(CofreApp));
    final container = ProviderScope.containerOf(element);
    repo.signedIn = false;
    await container.read(sessionProvider.notifier).restore();
    await tester.pumpAndSettle();
    container.read(routerProvider).go('/dashboard');
    await tester.pumpAndSettle();
    expect(find.text('Seu espaço, de volta.'), findsOneWidget);
    expect(find.text('Studio Ana'), findsNothing);
  });

  testWidgets('erro de login e recuperação de verificação de sessão', (
    tester,
  ) async {
    final repo = FakeAuth()..failRestore = true;
    await mount(tester, repo);
    expect(find.text('Sem conexão'), findsOneWidget);
    repo.failRestore = false;
    await tester.tap(find.text('Tentar novamente'));
    await tester.pumpAndSettle();
    repo.failLogin = true;
    await tester.enterText(find.byType(TextFormField).at(0), 'ana@example.com');
    await tester.enterText(
      find.byType(TextFormField).at(1),
      'senha-segura-123',
    );
    await tester.tap(find.widgetWithText(FilledButton, 'Entrar'));
    await tester.pumpAndSettle();
    expect(find.text('E-mail ou senha inválidos.'), findsOneWidget);
  });

  testWidgets('falha de logout mantém sessão e permite tentar novamente', (
    tester,
  ) async {
    final repo = FakeAuth(signedIn: true)..failLogout = true;
    await mount(tester, repo);
    await tester.tap(find.text('Sair'));
    await tester.pumpAndSettle();
    expect(find.text('Studio Ana'), findsOneWidget);
    expect(find.text('Sem conexão'), findsOneWidget);
    repo.failLogout = false;
    await tester.tap(find.text('Sair'));
    await tester.pumpAndSettle();
    expect(find.text('Seu espaço, de volta.'), findsOneWidget);
  });
}
