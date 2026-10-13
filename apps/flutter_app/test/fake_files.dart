import 'package:cofre_app/data/files_repository.dart';
import 'package:cofre_app/generated/api.g.dart';

class FakeFiles implements FilesRepository {
  String previewState = 'PENDING';
  String previewKind = 'IMAGE';
  final previewPages = <int>[];
  @override
  Future<PreviewStateView> previewStatus(String id) async => PreviewStateView(
    state: previewState,
    failureCode: null,
    pages: previewState == 'READY' ? 2 : 0,
  );
  @override
  Future<PreviewStateView> previewRetry(String id) async {
    previewState = 'PENDING';
    return previewStatus(id);
  }

  @override
  Future<PreviewView> preview(String id, int page) async {
    previewPages.add(page);
    return PreviewView(
      kind: previewKind,
      mime: previewKind == 'IMAGE'
          ? 'image/jpeg'
          : previewKind == 'VIDEO'
          ? 'video/mp4'
          : 'audio/mp4',
      durationMs: previewKind == 'IMAGE' ? null : 3000,
      url: 'https://preview.invalid/page-$page.jpg',
      expiresAt: '2026-10-13T12:00:00Z',
      page: page,
      pages: 2,
    );
  }

  bool enabled;
  bool failComplete = false;
  final items = <VersionView>[];
  final completions = <List<PartDto>>[];
  final aborted = <String>[];
  int used = 0;
  int reserved = 0;
  FakeFiles({this.enabled = false});
  @override
  Future<StorageView> storage() async => StorageView(
    enabled: enabled,
    maxFileBytes: '2147483648',
    quotaBytes: '10737418240',
    usedBytes: '$used',
    reservedBytes: '$reserved',
    activeUploads: reserved > 0 ? 1 : 0,
    maxActiveUploads: 5,
    mimeTypes: ['application/pdf'],
  );
  @override
  Future<VersionsView> versions(String projectId, {String? cursor}) async =>
      VersionsView(items: List.of(items), nextCursor: null);
  @override
  Future<VersionView> createVersion(String projectId) async {
    final v = VersionView(
      id: 'v-${items.length}',
      number: items.length + 1,
      state: 'DRAFT',
      createdAt: '2026-10-12T12:00:00Z',
      assets: [],
    );
    items.add(v);
    return v;
  }

  void update(AssetView asset) {
    final v = items.last;
    items[items.length - 1] = VersionView(
      id: v.id,
      number: v.number,
      state: v.state,
      createdAt: v.createdAt,
      assets: [...v.assets.where((a) => a.id != asset.id), asset],
    );
  }

  @override
  Future<UploadView> start(String versionId, StartUploadDto input) async {
    final asset = AssetView(
      id: 'asset-1',
      fileName: input.fileName,
      mime: input.declaredMime,
      sizeBytes: input.sizeBytes,
      status: 'UPLOADING',
      failureCode: null,
      expiresAt: '2026-10-13T12:00:00Z',
    );
    reserved = int.parse(input.sizeBytes);
    update(asset);
    return UploadView(
      asset: asset,
      partSizeBytes: 4,
      partCount: (reserved / 4).ceil(),
    );
  }

  @override
  Future<SignedPartsView> parts(String id, List<int> numbers) async =>
      SignedPartsView(
        parts: numbers
            .map(
              (n) =>
                  SignedPartView(partNumber: n, url: 'https://r2.invalid/$n'),
            )
            .toList(),
        expiresAt: '2026-10-12T12:05:00Z',
      );
  @override
  Future<AssetView> asset(String id) async =>
      items.expand((v) => v.assets).firstWhere((a) => a.id == id);
  @override
  Future<AssetView> complete(String id, List<PartDto> parts) async {
    completions.add(List.of(parts));
    if (failComplete) throw StateError('Connection failed');
    final a = AssetView.fromJson({
      ...((await asset(id)).toJson()),
      'status': 'READY',
    });
    used += reserved;
    reserved = 0;
    update(a);
    return a;
  }

  @override
  Future<AssetView> abort(String id) async {
    aborted.add(id);
    reserved = 0;
    final a = AssetView.fromJson({
      ...((await asset(id)).toJson()),
      'status': 'ABORTED',
    });
    update(a);
    return a;
  }

  @override
  Future<DownloadView> download(String id) async => const DownloadView(
    url: 'https://r2.invalid/download',
    expiresAt: '2026-10-12T12:01:00Z',
  );
}
