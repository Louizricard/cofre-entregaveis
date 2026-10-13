import 'package:flutter_test/flutter_test.dart';
import 'package:cofre_app/generated/api.g.dart';

import 'fake_files.dart';
import 'files_test.dart' as harness;

void main() {
  for (final status in ['PENDING', 'REJECTED', 'ERROR']) {
    testWidgets('segurança $status bloqueia download e visualização', (
      tester,
    ) async {
      final files = FakeFiles(enabled: true);
      await files.createVersion('p');
      files.update(
        AssetView(
          id: 'asset-1',
          fileName: 'arquivo.pdf',
          mime: 'application/pdf',
          sizeBytes: '10',
          status: 'READY',
          scanStatus: status,
          failureCode: null,
          expiresAt: '2026-10-13T12:00:00Z',
        ),
      );
      await harness.mount(tester, files, harness.FakeFile(), 360);
      await tester.pumpAndSettle();
      expect(find.text('Baixar original'), findsNothing);
      expect(find.text('Ver prévia'), findsNothing);
      expect(
        find.textContaining(
          status == 'REJECTED'
              ? 'Bloqueado pela análise'
              : 'Análise de segurança',
        ),
        findsOneWidget,
      );
      if (status == 'ERROR') {
        await tester.tap(find.text('Repetir análise de segurança'));
        await tester.pumpAndSettle();
        expect(
          find.textContaining('Análise de segurança pendente'),
          findsOneWidget,
        );
      } else {
        expect(find.text('Repetir análise de segurança'), findsNothing);
      }
      expect(tester.takeException(), isNull);
    });
  }
}
