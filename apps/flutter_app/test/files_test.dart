import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:cofre_app/data/files_repository.dart';
import 'package:cofre_app/data/upload_file_base.dart';
import 'package:cofre_app/presentation/files.dart';

import 'fake_files.dart';

class FakeFile implements UploadFile {
  @override
  String get name => 'arquivo.pdf';
  @override
  String get mime => 'application/pdf';
  @override
  int get size => 9;
  final ranges = <List<int>>[];
  Completer<String>? hold;
  bool failSecond = false;
  @override
  void cancel() {
    if (hold != null && !hold!.isCompleted)
      hold!.completeError(const UploadCancelled());
  }

  @override
  Future<String> sendPart(
    String url,
    int start,
    int end,
    void Function(int) progress,
  ) async {
    ranges.add([start, end]);
    progress(end - start);
    if (hold != null) return hold!.future;
    if (failSecond && start == 4) {
      failSecond = false;
      throw StateError('Network failed');
    }
    return 'etag-$start';
  }
}

Future<void> mount(
  WidgetTester tester,
  FakeFiles files,
  FakeFile file,
  double width, {
  List<String>? downloads,
}) async {
  tester.view.physicalSize = Size(width, 1000);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.resetPhysicalSize);
  addTearDown(tester.view.resetDevicePixelRatio);
  await tester.pumpWidget(
    ProviderScope(
      overrides: [
        filesRepositoryProvider.overrideWithValue(files),
        uploadFilePickerProvider.overrideWithValue(() async => file),
        downloadOpenerProvider.overrideWithValue((url) {
          downloads?.add(url);
        }),
      ],
      child: MaterialApp(
        home: Scaffold(
          body: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: FilesPanel(
                projectId: 'project-a',
                active: true,
                onBusy: (_) {},
              ),
            ),
          ),
        ),
      ),
    ),
  );
  await tester.pumpAndSettle();
}

void main() {
  for (final width in [360.0, 768.0, 1440.0]) {
    testWidgets('versão, upload em partes e download em ${width.toInt()} px', (
      tester,
    ) async {
      final files = FakeFiles(enabled: true);
      final file = FakeFile();
      final downloads = <String>[];
      await mount(tester, files, file, width, downloads: downloads);
      await tester.tap(find.text('Nova versão'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enviar arquivo'));
      await tester.pumpAndSettle();
      expect(file.ranges, [
        [0, 4],
        [4, 8],
        [8, 9],
      ]);
      expect(find.text('Arquivo enviado e validado.'), findsOneWidget);
      expect(find.textContaining('Original disponível'), findsOneWidget);
      expect(files.used, 9);
      expect(files.reserved, 0);
      expect(tester.takeException(), isNull);
      await tester.ensureVisible(find.text('Baixar original'));
      await tester.tap(find.text('Baixar original'));
      await tester.pumpAndSettle();
      expect(downloads, ['https://r2.invalid/download']);
    });
  }
  testWidgets(
    'retry preserva partes já enviadas e cancelamento libera a reserva',
    (tester) async {
      final files = FakeFiles(enabled: true);
      final file = FakeFile()..failSecond = true;
      await mount(tester, files, file, 360);
      await tester.tap(find.text('Nova versão'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Enviar arquivo'));
      await tester.pumpAndSettle();
      expect(find.text('Tentar novamente'), findsOneWidget);
      expect(files.used, 0);
      await tester.ensureVisible(find.text('Tentar novamente'));
      await tester.tap(find.text('Tentar novamente'));
      await tester.pumpAndSettle();
      expect(file.ranges, [
        [0, 4],
        [4, 8],
        [4, 8],
        [8, 9],
      ]);
      expect(files.used, 9);
      file.hold = Completer<String>();
      await tester.tap(find.text('Enviar arquivo'));
      await tester.pumpAndSettle();
      await tester.ensureVisible(find.text('Cancelar envio'));
      await tester.tap(find.text('Cancelar envio'));
      await tester.pumpAndSettle();
      expect(files.aborted, ['asset-1']);
      expect(files.reserved, 0);
    },
  );
  testWidgets('sem R2 mostra indisponibilidade e mantém envios desabilitados', (
    tester,
  ) async {
    final files = FakeFiles();
    await mount(tester, files, FakeFile(), 768);
    expect(
      find.textContaining('armazenamento ainda não foi configurado'),
      findsOneWidget,
    );
    await tester.tap(find.text('Nova versão'));
    await tester.pumpAndSettle();
    final button = tester.widget<FilledButton>(
      find.widgetWithText(FilledButton, 'Enviar arquivo'),
    );
    expect(button.onPressed, isNull);
  });
}
