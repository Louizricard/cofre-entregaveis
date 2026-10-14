import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/data/sharing_repository.dart';
import 'package:cofre_app/presentation/guest_identity.dart';

import 'sharing_test.dart' as harness;

void main() {
  Future<void> mount(
    WidgetTester tester,
    harness.FakeGuest guest,
    double width,
  ) async {
    tester.view.physicalSize = Size(width, 1000);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [guestRepositoryProvider.overrideWithValue(guest)],
        child: const MaterialApp(
          home: Scaffold(
            body: SingleChildScrollView(child: GuestIdentityPanel()),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets(
      'e-mail e código com zero inicial confirmam identidade em $width px',
      (tester) async {
        final guest = harness.FakeGuest()..identityEnabled = true;
        await mount(tester, guest, width);
        await tester.enterText(
          find.widgetWithText(TextFormField, 'E-mail do cliente'),
          ' CLIENT@EXAMPLE.COM ',
        );
        await tester.tap(find.text('Receber código'));
        await tester.pumpAndSettle();
        expect(guest.identityEmails, ['client@example.com']);
        expect(find.textContaining('Se o e-mail corresponder'), findsOneWidget);
        expect(find.text('Solicitar novamente em 60 s'), findsOneWidget);
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Código de 6 dígitos'),
          '012345',
        );
        await tester.tap(find.text('Confirmar e-mail'));
        await tester.pumpAndSettle();
        expect(guest.identityCodes, ['012345']);
        expect(find.text('E-mail confirmado neste acesso.'), findsOneWidget);
        expect(find.byType(TextFormField), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets(
    'sem configuração explica indisponibilidade sem oferecer confirmação falsa',
    (tester) async {
      await mount(tester, harness.FakeGuest(), 360);
      expect(find.textContaining('ainda não está disponível'), findsOneWidget);
      expect(find.text('Receber código'), findsNothing);
      expect(find.text('Confirmar e-mail'), findsNothing);
    },
  );
  testWidgets(
    'código errado mantém formulário e permite pedir outro após cooldown',
    (tester) async {
      final guest = harness.FakeGuest()..identityEnabled = true;
      await mount(tester, guest, 360);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'E-mail do cliente'),
        'client@example.com',
      );
      await tester.tap(find.text('Receber código'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Código de 6 dígitos'),
        '999999',
      );
      await tester.tap(find.text('Confirmar e-mail'));
      await tester.pumpAndSettle();
      expect(find.text('Código inválido ou expirado.'), findsOneWidget);
      expect(guest.identityVerified, isFalse);
      await tester.pump(const Duration(seconds: 61));
      await tester.tap(find.text('Solicitar outro código'));
      await tester.pumpAndSettle();
      expect(guest.identityEmails.length, 2);
      await tester.pumpWidget(const SizedBox.shrink());
    },
  );
  testWidgets('falha de envio não avança para entrada de código', (
    tester,
  ) async {
    final guest = harness.FakeGuest()
      ..identityEnabled = true
      ..failIdentity = true;
    await mount(tester, guest, 360);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'E-mail do cliente'),
      'client@example.com',
    );
    await tester.tap(find.text('Receber código'));
    await tester.pumpAndSettle();
    expect(find.text('Envio indisponível.'), findsOneWidget);
    expect(find.text('Código de 6 dígitos'), findsNothing);
    expect(guest.identityVerified, isFalse);
  });
}
