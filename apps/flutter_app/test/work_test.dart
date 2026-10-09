import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/application/work.dart';
import 'package:cofre_app/generated/api.g.dart';

import 'app_test.dart' show FakeAuth, mount;
import 'fake_work.dart';

Future<void> tapText(WidgetTester tester, String text) async {
  final finder = find.text(text).last;
  await tester.ensureVisible(finder);
  await tester.tap(finder);
  await tester.pumpAndSettle();
}

void main() {
  test('BRL é convertido sem arredondamento nem ponto flutuante', () {
    expect(parseBrlCents('1500,50'), 150050);
    expect(parseBrlCents('0,01'), 1);
    expect(parseBrlCents('1,1'), 110);
    expect(parseBrlCents('21474836,47'), 2147483647);
    for (final value in ['-1', '1.000,00', '1,234', '1e3', '21474836,48', '']) {
      expect(parseBrlCents(value), isNull);
    }
    expect(brlInput(150050), '1500,50');
  });
  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets(
      'cadastro de cliente/projeto, edição e arquivo em ${width.toInt()}px',
      (tester) async {
        final work = FakeWork();
        await mount(tester, FakeAuth(signedIn: true), width: width, work: work);
        await tapText(tester, 'Clientes');
        await tapText(tester, 'Novo cliente');
        await tapText(tester, 'Salvar cliente');
        expect(find.text('Informe um e-mail válido.'), findsOneWidget);
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Nome do cliente'),
          'Cliente Ana',
        );
        await tester.enterText(
          find.widgetWithText(TextFormField, 'E-mail do cliente'),
          'ana@example.com',
        );
        await tapText(tester, 'Salvar cliente');
        expect(work.clientItems.length, 1);
        await tapText(tester, 'Projetos');
        await tapText(tester, 'Novo projeto');
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Título do projeto'),
          'Identidade visual',
        );
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Saldo em reais (BRL)'),
          '-1',
        );
        await tapText(tester, 'Salvar projeto');
        expect(
          find.text('Use um valor entre 0 e 21474836,47.'),
          findsOneWidget,
        );
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Saldo em reais (BRL)'),
          '123,45',
        );
        await tapText(tester, 'Salvar projeto');
        expect(find.text('Selecione um cliente.'), findsOneWidget);
        await tapText(tester, 'Selecionar cliente');
        await tapText(tester, 'Cliente Ana');
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Revisões incluídas'),
          '2',
        );
        await tapText(tester, 'Salvar projeto');
        expect(work.projectItems.single.balanceCents, 12345);
        expect(find.text('Identidade visual'), findsOneWidget);
        await tapText(tester, 'Editar projeto');
        await tester.enterText(
          find.widgetWithText(TextFormField, 'Título do projeto'),
          'Projeto revisado',
        );
        await tapText(tester, 'Salvar projeto');
        expect(work.projectItems.single.revision, 2);
        await tapText(tester, 'Arquivar');
        await tapText(tester, 'Cancelar');
        expect(work.projectItems.single.status, 'ACTIVE');
        await tapText(tester, 'Arquivar');
        await tapText(tester, 'Arquivar');
        expect(find.text('Projeto revisado'), findsNothing);
        await tapText(tester, 'Arquivados');
        expect(find.text('Projeto revisado'), findsOneWidget);
        expect(find.text('Editar projeto'), findsNothing);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('conflito preserva formulário e busca atualiza lista', (
    tester,
  ) async {
    final work = FakeWork();
    await work.saveClient(
      const ClientDto(name: 'Ana', email: 'ana@example.com'),
    );
    await mount(tester, FakeAuth(signedIn: true), work: work);
    await tapText(tester, 'Clientes');
    await tapText(tester, 'Ana');
    work.failSave = true;
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Nome do cliente'),
      'Ana editada',
    );
    await tapText(tester, 'Salvar cliente');
    expect(find.text('Este registro mudou. Atualize a lista.'), findsOneWidget);
    expect(find.text('Ana editada'), findsOneWidget);
    await tapText(tester, 'Cancelar');
    await tapText(tester, 'Projetos');
    await tester.enterText(find.byType(TextField), 'Sem resultado');
    await tester.tap(find.byTooltip('Buscar'));
    await tester.pumpAndSettle();
    expect(work.lastSearch, 'Sem resultado');
    expect(find.text('Nenhum resultado para esta busca.'), findsOneWidget);
  });
}
