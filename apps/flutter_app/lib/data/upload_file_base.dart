abstract interface class UploadFile {
  String get name;
  String get mime;
  int get size;
  Future<String> sendPart(
    String url,
    int start,
    int end,
    void Function(int) progress,
  );
  void cancel();
}

class UploadCancelled implements Exception {
  const UploadCancelled();
}

const uploadTypes = {
  'png': 'image/png',
  'jpg': 'image/jpeg',
  'jpeg': 'image/jpeg',
  'webp': 'image/webp',
  'pdf': 'application/pdf',
  'mp4': 'video/mp4',
  'mp3': 'audio/mpeg',
  'wav': 'audio/wav',
  'zip': 'application/zip',
};
