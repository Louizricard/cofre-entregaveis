import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cofre_app/data/files_repository.dart';
import 'package:cofre_app/presentation/preview.dart';

import 'fake_files.dart';

void main() {
  Future<void> mount(WidgetTester tester, FakeFiles files) async {
    await tester.pumpWidget(
      ProviderScope(
        overrides: [filesRepositoryProvider.overrideWithValue(files)],
        child: const MaterialApp(
          home: Scaffold(
            body: PreviewDialog(assetId: 'asset-1', fileName: 'arquivo.pdf'),
          ),
        ),
      ),
    );
    await tester.pump();
    await tester.pump();
  }

  testWidgets('fila e falha nunca exibem original; retry manual volta à fila', (
    tester,
  ) async {
    final files = FakeFiles();
    await mount(tester, files);
    expect(find.text('Prévia na fila de processamento.'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    files.previewState = 'FAILED';
    await tester.tap(find.text('Atualizar'));
    await tester.pumpAndSettle();
    expect(find.text('Reprocessar prévia'), findsOneWidget);
    expect(find.byType(Image), findsNothing);
    await tester.tap(find.text('Reprocessar prévia'));
    await tester.pump();
    await tester.pump();
    expect(files.previewState, 'PENDING');
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets(
    'formato sem suporte mostra mensagem sem fallback para original',
    (tester) async {
      final files = FakeFiles()..previewState = 'UNSUPPORTED';
      await mount(tester, files);
      expect(
        find.textContaining('Este formato ainda não tem prévia'),
        findsOneWidget,
      );
      expect(find.byType(Image), findsNothing);
    },
  );
  testWidgets('navegação pede apenas páginas de derivados', (tester) async {
    final files = FakeFiles()..previewState = 'READY';
    await mount(tester, files);
    expect(files.previewPages, [1]);
    expect(find.text('Página 1 de 2'), findsOneWidget);
    await tester.tap(find.byTooltip('Próxima página'));
    await tester.pump();
    await tester.pump();
    expect(files.previewPages, [1, 2]);
    expect(find.text('Página 2 de 2'), findsOneWidget);
    expect(
      (tester.widget<Image>(find.byType(Image)).image as NetworkImage).url,
      'https://preview.invalid/page-2.jpg',
    );
  });
}
