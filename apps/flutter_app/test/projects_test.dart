import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/presentation/projects.dart';

import 'app_test.dart' show FakeAuth, mount;

void main() {
  test('converte reais em centavos sem arredondamento e respeita limites', () {
    expect(parseCents('1500,50'), 150050);
    expect(parseCents('0,01'), 1);
    expect(parseCents('12,3'), 1230);
    expect(parseCents('21474836,47'), 2147483647);
    for (final invalid in [
      '-1',
      '1.234,56',
      '1,234',
      '1.5',
      '21474836,48',
      'NaN',
      '',
    ]) {
      expect(parseCents(invalid), isNull);
    }
    expect(money(150050), 'R\$ 1.500,50');
    expect(money(0), 'R\$ 0,00');
  });
  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets('cliente, projeto e arquivamento em ${width.toInt()} px', (
      tester,
    ) async {
      final repo = FakeAuth(signedIn: true);
      await mount(tester, repo, width: width);
      await tester.tap(find.text('Novo projeto'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Criar projeto'));
      await tester.pumpAndSettle();
      expect(find.text('Informe o título.'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Título do projeto'),
        'Identidade visual',
      );
      await tester.tap(find.text('Selecionar cliente'));
      await tester.pumpAndSettle();
      await tester.tap(find.widgetWithText(TextButton, 'Novo cliente'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Nome do cliente'),
        'Cliente A',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'E-mail do cliente'),
        'cliente@example.com',
      );
      await tester.tap(find.text('Salvar cliente'));
      await tester.pumpAndSettle();
      expect(find.text('Cliente: Cliente A'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Saldo a receber (R\$)'),
        '-1',
      );
      await tester.tap(find.text('Criar projeto'));
      await tester.pumpAndSettle();
      expect(repo.projectItems, isEmpty);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Saldo a receber (R\$)'),
        '1500,50',
      );
      await tester.tap(find.text('Criar projeto'));
      await tester.pumpAndSettle();
      expect(repo.projectItems.single.balanceCents, 150050);
      expect(find.text('Identidade visual'), findsOneWidget);
      expect(tester.takeException(), isNull);
      await tester.tap(find.text('Identidade visual'));
      await tester.pumpAndSettle();
      expect(find.text('Saldo a receber: R\$ 1.500,50'), findsOneWidget);
      await tester.tap(find.text('Arquivar projeto'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Cancelar'));
      await tester.pumpAndSettle();
      expect(repo.projectItems.single.status, 'ACTIVE');
      await tester.tap(find.text('Arquivar projeto'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirmar arquivamento'));
      await tester.pumpAndSettle();
      expect(repo.projectItems.single.status, 'ARCHIVED');
      expect(find.text('Identidade visual'), findsNothing);
      await tester.tap(find.text('Arquivados'));
      await tester.pumpAndSettle();
      expect(find.text('Identidade visual'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
    'falha de lista permite retry e cadastro preserva campos após erro',
    (tester) async {
      final repo = FakeAuth(signedIn: true)..failList = true;
      await mount(tester, repo);
      expect(find.text('Sem conexão'), findsOneWidget);
      repo.failList = false;
      await tester.tap(find.text('Tentar novamente'));
      await tester.pumpAndSettle();
      expect(find.text('Um novo começo.'), findsOneWidget);
      await tester.tap(find.text('Novo cliente'));
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Nome do cliente'),
        'Cliente A',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'E-mail do cliente'),
        'cliente@example.com',
      );
      repo.failSave = true;
      await tester.tap(find.text('Salvar cliente'));
      await tester.pumpAndSettle();
      expect(
        find.text('Já existe um cliente com este e-mail.'),
        findsOneWidget,
      );
      expect(find.text('cliente@example.com'), findsOneWidget);
      repo.failSave = false;
      await tester.tap(find.text('Salvar cliente'));
      await tester.pumpAndSettle();
      expect(find.text('Cliente A'), findsOneWidget);
      expect(repo.clientItems.length, 1);
    },
  );
}
