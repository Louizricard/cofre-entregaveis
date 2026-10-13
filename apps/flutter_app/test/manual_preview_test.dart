import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/generated/api.g.dart';
import 'package:cofre_app/presentation/manual_preview.dart';

AssetView asset(String id, String mime, {String status = 'READY'}) => AssetView(
  scanStatus: 'CLEAN',
  id: id,
  fileName: '$id.${mime == 'application/pdf' ? 'pdf' : 'png'}',
  mime: mime,
  sizeBytes: '10',
  status: status,
  failureCode: null,
  expiresAt: '2026-10-13T12:00:00Z',
);
void main() {
  Future<void> mount(
    WidgetTester tester,
    List<AssetView> assets,
    void Function(String?) result,
  ) async {
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: Builder(
            builder: (context) => TextButton(
              onPressed: () async {
                result(
                  await showDialog<String>(
                    context: context,
                    builder: (_) => ManualPreviewDialog(assets: assets),
                  ),
                );
              },
              child: const Text('Abrir'),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('Abrir'));
    await tester.pumpAndSettle();
  }

  testWidgets(
    'sem fonte concluída orienta enviar imagem/PDF e impede vínculo',
    (tester) async {
      await mount(tester, [
        asset('zip', 'application/zip'),
        asset('pendente', 'image/png', status: 'UPLOADING'),
      ], (_) {});
      expect(find.textContaining('Envie primeiro'), findsOneWidget);
      expect(
        tester
            .widget<FilledButton>(
              find.widgetWithText(FilledButton, 'Vincular prévia'),
            )
            .onPressed,
        isNull,
      );
      expect(find.byType(DropdownButtonFormField<String>), findsNothing);
    },
  );
  testWidgets(
    'seleção permite apenas imagem/PDF prontos e retorna ID escolhido',
    (tester) async {
      String? selected;
      await mount(tester, [
        asset('zip', 'application/zip'),
        asset('imagem', 'image/png'),
        asset('resumo', 'application/pdf'),
      ], (value) => selected = value);
      await tester.tap(find.byType(DropdownButtonFormField<String>));
      await tester.pumpAndSettle();
      expect(find.text('zip.png'), findsNothing);
      await tester.tap(find.text('resumo.pdf').last);
      await tester.pumpAndSettle();
      await tester.tap(find.text('Vincular prévia'));
      await tester.pumpAndSettle();
      expect(selected, 'resumo');
    },
  );
  testWidgets(
    'remoção retorna ação distinta de cancelar e mantém lista de fontes',
    (tester) async {
      String? selected;
      final sources = [asset('resumo', 'application/pdf')];
      await mount(tester, sources, (value) => selected = value);
      await tester.tap(find.text('Remover prévia manual'));
      await tester.pumpAndSettle();
      expect(selected, '');
      expect(sources.length, 1);
    },
  );
}
