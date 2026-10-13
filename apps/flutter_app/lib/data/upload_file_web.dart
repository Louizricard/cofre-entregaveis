import 'dart:async';
import 'dart:js_interop';

import 'package:web/web.dart' as web;

import 'upload_file_base.dart';
export 'upload_file_base.dart';

Future<UploadFile?> pickUploadFile() {
  final result = Completer<UploadFile?>();
  final input = web.HTMLInputElement()
    ..type = 'file'
    ..accept = uploadTypes.keys.map((e) => '.$e').join(',');
  input.style.display = 'none';
  web.document.body!.appendChild(input);
  input.addEventListener(
    'change',
    ((web.Event e) {
      if (!result.isCompleted)
        result.complete(
          input.files?.length == 1
              ? BrowserUploadFile(input.files!.item(0)!)
              : null,
        );
      input.remove();
    }).toJS,
  );
  input.addEventListener(
    'cancel',
    ((web.Event e) {
      if (!result.isCompleted) result.complete(null);
      input.remove();
    }).toJS,
  );
  input.click();
  return result.future;
}

void openFileDownload(String url) {
  final anchor = web.HTMLAnchorElement()
    ..href = url
    ..download = ''
    ..rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  web.document.body!.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

class BrowserUploadFile implements UploadFile {
  final web.File file;
  web.XMLHttpRequest? _active;
  BrowserUploadFile(this.file);
  @override
  String get name => file.name;
  @override
  String get mime => uploadTypes[name.split('.').last.toLowerCase()] ?? '';
  @override
  int get size => file.size;
  @override
  void cancel() => _active?.abort();
  @override
  Future<String> sendPart(
    String url,
    int start,
    int end,
    void Function(int) progress,
  ) {
    final done = Completer<String>();
    final xhr = web.XMLHttpRequest();
    _active = xhr;
    xhr.open('PUT', url);
    xhr.withCredentials = false;
    xhr.timeout = 120000;
    xhr.upload.addEventListener(
      'progress',
      ((web.ProgressEvent event) {
        progress(event.loaded);
      }).toJS,
    );
    xhr.addEventListener(
      'load',
      ((web.Event event) {
        final etag = xhr.getResponseHeader('ETag');
        if (xhr.status >= 200 && xhr.status < 300 && etag != null) {
          if (!done.isCompleted) done.complete(etag);
        } else if (!done.isCompleted) {
          done.completeError(
            StateError('Falha no envio ou ETag indisponível.'),
          );
        }
      }).toJS,
    );
    for (final event in ['error', 'timeout']) {
      xhr.addEventListener(
        event,
        ((web.Event event) {
          if (!done.isCompleted)
            done.completeError(
              StateError('Falha de conexão com o armazenamento.'),
            );
        }).toJS,
      );
    }
    xhr.addEventListener(
      'abort',
      ((web.Event event) {
        if (!done.isCompleted) done.completeError(const UploadCancelled());
      }).toJS,
    );
    xhr.send(file.slice(start, end));
    return done.future.whenComplete(() {
      _active = null;
    });
  }
}
