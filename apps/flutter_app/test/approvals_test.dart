import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:cofre_app/data/approvals_repository.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/generated/api.g.dart';
import 'package:cofre_app/presentation/approvals.dart';

const approval = ApprovalView(
  id: 'approval',
  versionId: 'v1',
  authorLabel: 'Cliente confirmado',
  approvedAt: '2026-10-14T12:00:00Z',
);

class FakeApprovals implements ApprovalsRepository {
  ApprovalView? saved;
  String state = 'PUBLISHED';
  String? reason;
  bool denied = false;
  bool loseResponse = false;
  final keys = <String>[];
  @override
  Future<ApprovalStatusView> status(
    String versionId, {
    required bool guest,
  }) async {
    if (denied) throw const ApiFailure(403, 'Confirme seu e-mail no portal.');
    return ApprovalStatusView(
      versionId: versionId,
      versionNumber: 1,
      versionState: state,
      approval: saved,
      canApprove:
          guest && saved == null && state == 'PUBLISHED' && reason == null,
      reason: reason,
    );
  }

  @override
  Future<ApprovalView> approve(String versionId, String key) async {
    keys.add(key);
    saved = approval;
    if (loseResponse) {
      loseResponse = false;
      throw const ApiFailure(0, 'Resposta perdida.');
    }
    return saved!;
  }
}

void main() {
  Future<void> mount(
    WidgetTester tester,
    FakeApprovals repo, {
    bool guest = true,
    double width = 768,
  }) async {
    tester.view.physicalSize = Size(width, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [approvalsRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp(
          home: Scaffold(
            body: ApprovalDialog(versionId: 'v1', guest: guest),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets('aprovação exige checkbox e mostra confirmação em $width', (
      tester,
    ) async {
      final repo = FakeApprovals();
      await mount(tester, repo, width: width);
      final button = find.widgetWithText(FilledButton, 'Confirmar aprovação');
      expect(tester.widget<FilledButton>(button).onPressed, isNull);
      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      await tester.ensureVisible(button);
      await tester.tap(button);
      await tester.pumpAndSettle();
      expect(repo.keys.length, 1);
      expect(
        find.text('Versão aprovada pelo cliente confirmado.'),
        findsOneWidget,
      );
      expect(find.byType(Checkbox), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets(
    'retry de resposta perdida usa a mesma chave e não duplica aprovação',
    (tester) async {
      final repo = FakeApprovals()..loseResponse = true;
      await mount(tester, repo);
      await tester.tap(find.byType(Checkbox));
      await tester.pump();
      await tester.tap(find.text('Confirmar aprovação'));
      await tester.pumpAndSettle();
      expect(find.text('Resposta perdida.'), findsOneWidget);
      await tester.tap(find.text('Confirmar aprovação'));
      await tester.pumpAndSettle();
      expect(repo.keys.length, 2);
      expect(repo.keys[0], repo.keys[1]);
    },
  );
  testWidgets('histórico conserva aprovação e não permite aprovar novamente', (
    tester,
  ) async {
    await mount(
      tester,
      FakeApprovals()
        ..saved = approval
        ..state = 'SUPERSEDED',
    );
    expect(find.textContaining('somente à versão anterior'), findsOneWidget);
    expect(find.text('Confirmar aprovação'), findsNothing);
  });
  testWidgets('criador consulta e não recebe botão de aprovação', (
    tester,
  ) async {
    await mount(tester, FakeApprovals(), guest: false);
    expect(find.text('Esta versão ainda não foi aprovada.'), findsOneWidget);
    expect(find.byType(Checkbox), findsNothing);
  });
  testWidgets('ajustes em andamento bloqueiam formulário', (tester) async {
    await mount(tester, FakeApprovals()..reason = 'Há ajustes em andamento.');
    expect(find.text('Há ajustes em andamento.'), findsOneWidget);
    expect(find.byType(Checkbox), findsNothing);
  });
  testWidgets('identidade revogada na atualização limpa status anterior', (
    tester,
  ) async {
    final repo = FakeApprovals()..saved = approval;
    await mount(tester, repo);
    repo.denied = true;
    await tester.tap(find.text('Atualizar'));
    await tester.pumpAndSettle();
    expect(find.text('Confirme seu e-mail no portal.'), findsOneWidget);
    expect(find.text('Versão aprovada pelo cliente confirmado.'), findsNothing);
  });
  test('contrato preserva aprovação nula e transporte envia confirmação/chave/CSRF', () async {
    const empty = ApprovalStatusView(
      versionId: 'v1',
      versionNumber: 1,
      versionState: 'PUBLISHED',
      approval: null,
      canApprove: true,
      reason: null,
    );
    expect(ApprovalStatusView.fromJson(empty.toJson()).approval, isNull);
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/csrf'))
        return http.Response('{"csrfToken":"csrf"}', 200);
      expect(req.headers['idempotency-key'], 'stable');
      expect(req.headers['x-csrf-token'], 'csrf');
      expect(jsonDecode(req.body), {'versionId': 'v1', 'confirmed': true});
      return http.Response(jsonEncode(approval.toJson()), 201);
    });
    final transport = HttpAuthRepository(
      client,
      Uri.parse('http://localhost:3000'),
    );
    await HttpApprovalsRepository(
      transport.api,
      transport.api,
    ).approve('v1', 'stable');
    client.close();
  });
}
