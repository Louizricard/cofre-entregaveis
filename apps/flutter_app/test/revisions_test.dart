import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/data/revisions_repository.dart';
import 'package:cofre_app/generated/api.g.dart';
import 'package:cofre_app/presentation/revisions.dart';

RevisionRoundView round({String state = 'OPEN'}) => RevisionRoundView(
  id: 'round',
  versionId: 'v1',
  versionNumber: 1,
  summary: '<b>Ajustar título</b>',
  state: state,
  extra: true,
  commentCount: 2,
  decisionReason: null,
  createdAt: '2026-10-14T12:00:00Z',
  decidedAt: null,
  resolvedAt: null,
);

class FakeRevisions implements RevisionsRepository {
  final items = <RevisionRoundView>[];
  final keys = <String>[];
  bool lose = false;
  bool denied = false;
  bool available = true;
  String? decision;
  String? reason;
  @override
  Future<RevisionsView> list(String projectId, {required bool guest}) async {
    if (denied) throw const ApiFailure(403, 'Confirme seu e-mail no portal.');
    return RevisionsView(
      items: List.of(items),
      included: 0,
      used: items.where((r) => r.state == 'OPEN').length,
      currentVersionId: 'v1',
      canRequest: available,
    );
  }

  @override
  Future<RevisionRoundView> request(
    RequestRevisionDto input,
    String key,
  ) async {
    keys.add(key);
    if (lose) {
      lose = false;
      throw const ApiFailure(0, 'Resposta perdida');
    }
    final value = round(state: 'PENDING');
    items.add(value);
    available = false;
    return value;
  }

  @override
  Future<RevisionRoundView> decide(String id, DecideRevisionDto input) async {
    decision = input.decision;
    reason = input.reason;
    final value = round();
    items[0] = value;
    return value;
  }
}

void main() {
  Future<void> mount(
    WidgetTester tester,
    FakeRevisions repo, {
    double width = 768,
    bool guest = true,
    String version = 'v1',
  }) async {
    tester.view.physicalSize = Size(width, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [revisionsRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp(
          home: Scaffold(
            body: RevisionsDialog(
              projectId: 'project',
              versionId: version,
              guest: guest,
            ),
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
  }

  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets('pedido extra informa decisão e fecha coleta em $width', (
      tester,
    ) async {
      final repo = FakeRevisions();
      await mount(tester, repo, width: width);
      expect(find.textContaining('precisará da decisão'), findsOneWidget);
      await tester.enterText(find.byType(TextField), 'Ajustar a entrega');
      await tester.ensureVisible(find.text('Pedir ajustes'));
      await tester.tap(find.text('Pedir ajustes'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Aguardando decisão'), findsOneWidget);
      expect(find.byType(TextField), findsNothing);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('resposta perdida mantém a chave da tentativa', (tester) async {
    final repo = FakeRevisions()..lose = true;
    await mount(tester, repo);
    await tester.enterText(find.byType(TextField), 'Ajustar');
    await tester.tap(find.text('Pedir ajustes'));
    await tester.pumpAndSettle();
    expect(find.text('Resposta perdida'), findsOneWidget);
    await tester.tap(find.text('Pedir ajustes'));
    await tester.pumpAndSettle();
    expect(repo.keys.length, 2);
    expect(repo.keys[0], repo.keys[1]);
  });
  testWidgets('histórico não oferece formulário', (tester) async {
    await mount(tester, FakeRevisions(), version: 'old');
    expect(find.byType(TextField), findsNothing);
  });
  testWidgets('identidade não confirmada mostra orientação', (tester) async {
    await mount(tester, FakeRevisions()..denied = true);
    expect(find.textContaining('Confirme seu e-mail'), findsOneWidget);
    expect(find.byType(TextField), findsNothing);
  });
  testWidgets('criador aceita extra com justificativa e lê texto literal', (
    tester,
  ) async {
    final repo = FakeRevisions()..items.add(round(state: 'PENDING'));
    await mount(tester, repo, guest: false);
    expect(find.text('<b>Ajustar título</b>'), findsOneWidget);
    await tester.tap(find.text('Aceitar extra'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextField), 'Escopo combinado');
    await tester.tap(find.text('Confirmar'));
    await tester.pumpAndSettle();
    expect(repo.decision, 'ACCEPT');
    expect(repo.reason, 'Escopo combinado');
    expect(find.textContaining('Em ajustes'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
  test('cliente gerado envia chave junto com CSRF sem perder corpo', () async {
    final client = MockClient((req) async {
      if (req.url.path.endsWith('/csrf'))
        return http.Response('{"csrfToken":"csrf"}', 200);
      expect(req.headers['idempotency-key'], 'stable-key');
      expect(req.headers['x-csrf-token'], 'csrf');
      expect(jsonDecode(req.body)['versionId'], 'v1');
      return http.Response(jsonEncode(round().toJson()), 201);
    });
    final repo = HttpAuthRepository(client, Uri.parse('http://localhost:3000'));
    await repo.api.revisionsrequest(
      const RequestRevisionDto(versionId: 'v1', summary: 'Ajustar'),
      idempotencyKey: 'stable-key',
    );
    client.close();
  });
}
