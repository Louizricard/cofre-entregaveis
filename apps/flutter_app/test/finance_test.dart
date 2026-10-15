import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/data/finance_repository.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/generated/api.g.dart';
import 'package:cofre_app/presentation/finance.dart';
import 'package:cofre_app/presentation/files.dart';

FinanceView view({String state = 'OPEN', int revision = 0}) => FinanceView(
  invoice: InvoiceView(
    id: 'invoice',
    number: 1,
    amountCents: 12500,
    currency: 'BRL',
    state: state,
    revision: revision,
  ),
  history: const [],
  canSettle: state == 'OPEN',
  canReverse: state == 'PAID',
);

class FakeFinance implements FinanceRepository {
  FinanceView current = view();
  bool loseReply = false;
  final keys = <String>[];
  final inputs = <ManualSettlementDto>[];
  @override
  Future<FinanceView> load(String projectId) async => current;
  @override
  Future<FinanceView> settle(
    String projectId,
    ManualSettlementDto input,
    String key,
  ) async {
    keys.add(key);
    inputs.add(input);
    current = view(state: 'PAID', revision: 1);
    if (loseReply) {
      loseReply = false;
      throw const ApiFailure(0, 'Resposta perdida. Tente novamente.');
    }
    return current;
  }

  @override
  Future<DownloadView> download(String assetId) async =>
      throw const ApiFailure(403, 'Confirme seu e-mail no portal.');
}

void main() {
  testWidgets(
    'quitação exige motivo e confirmação; retry conserva chave e payload após resposta perdida',
    (tester) async {
      final repo = FakeFinance()..loseReply = true;
      await tester.pumpWidget(
        ProviderScope(
          overrides: [financeRepositoryProvider.overrideWithValue(repo)],
          child: const MaterialApp(
            home: Scaffold(body: FinanceDialog(projectId: 'project')),
          ),
        ),
      );
      await tester.pumpAndSettle();
      expect(
        tester.widget<FilledButton>(find.byType(FilledButton)).onPressed,
        isNull,
      );
      await tester.tap(find.byType(CheckboxListTile));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.byType(FilledButton));
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(
        find.text('Informe um motivo com pelo menos 5 caracteres.'),
        findsOneWidget,
      );
      expect(repo.keys, isEmpty);
      await tester.enterText(
        find.byType(TextField),
        'Transferência recebida externamente',
      );
      await tester.ensureVisible(find.byType(FilledButton));
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(find.text('Repetir confirmação'), findsOneWidget);
      expect(tester.widget<TextField>(find.byType(TextField)).enabled, false);
      await tester.ensureVisible(find.byType(FilledButton));
      await tester.tap(find.byType(FilledButton));
      await tester.pumpAndSettle();
      expect(repo.keys.length, 2);
      expect(repo.keys[0], repo.keys[1]);
      expect(identical(repo.inputs[0], repo.inputs[1]), true);
      expect(repo.inputs[0].confirmed, true);
      expect(find.text('Pagamento externo registrado'), findsOneWidget);
    },
  );
  testWidgets('download recusado mostra a condição pendente sem abrir URL', (
    tester,
  ) async {
    final opened = <String>[];
    await tester.pumpWidget(
      ProviderScope(
        overrides: [
          financeRepositoryProvider.overrideWithValue(FakeFinance()),
          downloadOpenerProvider.overrideWithValue(opened.add),
        ],
        child: const MaterialApp(
          home: Scaffold(body: GuestOriginalButton(assetId: 'asset')),
        ),
      ),
    );
    await tester.tap(find.text('Baixar original'));
    await tester.pumpAndSettle();
    expect(find.text('Confirme seu e-mail no portal.'), findsOneWidget);
    expect(opened, isEmpty);
  });
}
