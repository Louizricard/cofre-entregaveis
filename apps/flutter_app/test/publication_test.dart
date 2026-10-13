import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/generated/api.g.dart';

import 'fake_files.dart';
import 'files_test.dart' as harness;

Future<FakeFiles> prepared() async {
  final files = FakeFiles(enabled: true);
  await files.createVersion('p');
  files.update(
    const AssetView(
      id: 'zip',
      fileName: 'arquivo.zip',
      mime: 'application/zip',
      sizeBytes: '10',
      status: 'READY',
      scanStatus: 'CLEAN',
      failureCode: null,
      expiresAt: '2026-10-13T12:00:00Z',
    ),
  );
  return files;
}

void main() {
  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets(
      'publicação confirmada preserva arquivos e bloqueia edição em $width px',
      (tester) async {
        final files = await prepared();
        await harness.mount(tester, files, harness.FakeFile(), width);
        await tester.pumpAndSettle();
        await tester.tap(find.text('Publicar versão'));
        await tester.pumpAndSettle();
        expect(files.items.single.state, 'DRAFT');
        await tester.tap(find.text('Confirmar publicação'));
        await tester.pumpAndSettle();
        expect(files.items.single.state, 'PUBLISHED');
        expect(files.items.single.assets.single.fileName, 'arquivo.zip');
        expect(find.text('Enviar arquivo'), findsNothing);
        expect(find.text('Escolher prévia manual'), findsNothing);
        expect(find.text('Publicar versão'), findsNothing);
        expect(find.text('Nova versão'), findsOneWidget);
        expect(find.text('Baixar original'), findsOneWidget);
        expect(tester.takeException(), isNull);
      },
    );
  }
  testWidgets('cancelar publicação mantém rascunho editável', (tester) async {
    final files = await prepared();
    await harness.mount(tester, files, harness.FakeFile(), 360);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Publicar versão'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancelar'));
    await tester.pumpAndSettle();
    expect(files.items.single.state, 'DRAFT');
    expect(find.text('Enviar arquivo'), findsOneWidget);
  });
  testWidgets('falha de publicação preserva rascunho e mostra recuperação', (
    tester,
  ) async {
    final files = await prepared();
    files.failPublish = true;
    await harness.mount(tester, files, harness.FakeFile(), 360);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Publicar versão'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirmar publicação'));
    await tester.pumpAndSettle();
    expect(files.items.single.state, 'DRAFT');
    expect(find.text('Publicar versão'), findsOneWidget);
    expect(find.text('Atualizar arquivos'), findsOneWidget);
    expect(tester.takeException(), isNull);
  });
}
