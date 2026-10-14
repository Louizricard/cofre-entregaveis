import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/data/comments_repository.dart';
import 'package:cofre_app/data/auth_repository.dart';
import 'package:cofre_app/generated/api.g.dart';
import 'package:cofre_app/presentation/comments.dart';

class FakeComments implements CommentsRepository {
  bool allowed = true;
  bool deny = false;
  bool loseResponse = false;
  List<String> types = ['GENERAL', 'PDF_POINT', 'IMAGE_POINT', 'TIME'];
  final attempts = <CreateCommentDto>[];
  final items = <CommentView>[];
  final committed = <String, CommentView>{};
  @override
  Future<CommentsView> list(
    String assetId, {
    required bool guest,
    String? cursor,
  }) async {
    if (deny)
      throw const ApiFailure(
        403,
        'Confirme seu e-mail no portal para acessar os comentários.',
      );
    return CommentsView(
      items: List.of(items),
      nextCursor: null,
      canComment: guest && allowed,
      anchorTypes: types,
      pages: 2,
      durationMs: 3000,
    );
  }

  @override
  Future<CommentView> create(CreateCommentDto input) async {
    attempts.add(input);
    final result = committed.putIfAbsent(input.clientRequestId, () {
      final value = CommentView(
        id: input.clientRequestId,
        body: input.body,
        authorLabel: 'Cliente confirmado',
        createdAt: '2026-10-14T12:00:00Z',
        anchor: CommentAnchorView(
          kind: input.anchor.kind,
          timeMs: input.anchor.timeMs,
          page: input.anchor.page,
          x: input.anchor.x,
          y: input.anchor.y,
        ),
      );
      items.add(value);
      return value;
    });
    if (loseResponse) {
      loseResponse = false;
      throw const ApiFailure(0, 'Resposta perdida.');
    }
    return result;
  }
}

void main() {
  Future<void> mount(
    WidgetTester tester,
    FakeComments repo,
    double width, {
    bool guest = true,
  }) async {
    tester.view.physicalSize = Size(width, 1100);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    await tester.pumpWidget(
      ProviderScope(
        overrides: [commentsRepositoryProvider.overrideWithValue(repo)],
        child: MaterialApp(
          home: Scaffold(
            body: Builder(
              builder: (context) => TextButton(
                onPressed: () => showDialog<void>(
                  context: context,
                  builder: (_) => CommentsDialog(
                    assetId: 'asset',
                    fileName: 'Teste.pdf',
                    guest: guest,
                  ),
                ),
                child: const Text('Abrir'),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Abrir'));
    await tester.pumpAndSettle();
  }

  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets('cliente identificado comenta com texto literal em $width px', (
      tester,
    ) async {
      final repo = FakeComments();
      await mount(tester, repo, width);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Seu comentário'),
        '<script>texto</script>',
      );
      await tester.ensureVisible(find.text('Enviar comentário'));
      await tester.tap(find.text('Enviar comentário'));
      await tester.pumpAndSettle();
      expect(repo.items.length, 1);
      expect(find.text('<script>texto</script>'), findsOneWidget);
      expect(find.text('Comentário enviado.'), findsOneWidget);
      expect(tester.takeException(), isNull);
    });
  }
  testWidgets('sem identidade não carrega comentários nem libera escrita', (
    tester,
  ) async {
    await mount(tester, FakeComments()..deny = true, 360);
    expect(find.textContaining('Confirme seu e-mail'), findsOneWidget);
    expect(find.text('Enviar comentário'), findsNothing);
  });
  for (final guest in [true, false]) {
    testWidgets(
      'histórico e painel do criador são somente consulta: guest=$guest',
      (tester) async {
        final repo = FakeComments()..allowed = false;
        repo.items.add(
          const CommentView(
            id: 'old',
            body: 'Comentário anterior',
            authorLabel: 'Cliente confirmado',
            createdAt: '2026-10-14T12:00:00Z',
            anchor: CommentAnchorView(
              kind: 'GENERAL',
              timeMs: null,
              page: null,
              x: null,
              y: null,
            ),
          ),
        );
        await mount(tester, repo, 360, guest: guest);
        expect(find.text('Comentário anterior'), findsOneWidget);
        expect(find.text('Enviar comentário'), findsNothing);
      },
    );
  }
  testWidgets(
    'repetir envio após resposta perdida reutiliza tentativa e não duplica comentário',
    (tester) async {
      final repo = FakeComments()..loseResponse = true;
      await mount(tester, repo, 360);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Seu comentário'),
        'Ajuste',
      );
      await tester.ensureVisible(find.text('Enviar comentário'));
      await tester.tap(find.text('Enviar comentário'));
      await tester.pumpAndSettle();
      expect(find.text('Resposta perdida.'), findsOneWidget);
      await tester.tap(find.text('Enviar comentário'));
      await tester.pumpAndSettle();
      expect(
        repo.attempts[0].clientRequestId,
        repo.attempts[1].clientRequestId,
      );
      expect(repo.items.length, 1);
    },
  );
  testWidgets(
    'página e ponto de PDF são convertidos e validados antes do envio',
    (tester) async {
      final repo = FakeComments();
      await mount(tester, repo, 360);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Seu comentário'),
        'Ponto específico',
      );
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ponto no PDF').last);
      await tester.pumpAndSettle();
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Página do PDF'),
        '3',
      );
      await tester.ensureVisible(find.text('Enviar comentário'));
      await tester.tap(find.text('Enviar comentário'));
      await tester.pumpAndSettle();
      expect(repo.items, isEmpty);
      expect(find.text('Informe uma página entre 1 e 2.'), findsOneWidget);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Página do PDF'),
        '2',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Posição horizontal (%)'),
        '25',
      );
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Posição vertical (%)'),
        '75',
      );
      await tester.ensureVisible(find.text('Enviar comentário'));
      await tester.tap(find.text('Enviar comentário'));
      await tester.pumpAndSettle();
      expect(repo.attempts.single.anchor.page, 2);
      expect(repo.attempts.single.anchor.x, 0.25);
      expect(repo.attempts.single.anchor.y, 0.75);
    },
  );
  testWidgets(
    'atualizar referências preserva texto e remove seleção indisponível',
    (tester) async {
      final repo = FakeComments();
      await mount(tester, repo, 360);
      await tester.enterText(
        find.widgetWithText(TextFormField, 'Seu comentário'),
        'Texto preservado',
      );
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Ponto no PDF').last);
      await tester.pumpAndSettle();
      repo.types = ['GENERAL'];
      await tester.tap(find.text('Atualizar comentários'));
      await tester.pumpAndSettle();
      expect(find.text('Página do PDF'), findsNothing);
      expect(find.text('Texto preservado'), findsOneWidget);
      expect(tester.takeException(), isNull);
    },
  );
  testWidgets('instante temporal respeita duração da prévia', (tester) async {
    final repo = FakeComments();
    await mount(tester, repo, 360);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Seu comentário'),
      'Neste momento',
    );
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Momento do áudio/vídeo').last);
    await tester.pumpAndSettle();
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Segundo da prévia'),
      '4',
    );
    await tester.tap(find.text('Enviar comentário'));
    await tester.pumpAndSettle();
    expect(repo.items, isEmpty);
    await tester.enterText(
      find.widgetWithText(TextFormField, 'Segundo da prévia'),
      '1,5',
    );
    await tester.tap(find.text('Enviar comentário'));
    await tester.pumpAndSettle();
    expect(repo.attempts.single.anchor.timeMs, 1500);
  });
}
