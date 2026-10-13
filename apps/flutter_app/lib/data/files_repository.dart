import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../application/session.dart';
import '../generated/api.g.dart';
import 'auth_repository.dart';

abstract interface class FilesRepository {
  Future<StorageView> storage();
  Future<VersionsView> versions(String projectId, {String? cursor});
  Future<VersionView> createVersion(String projectId);
  Future<UploadView> start(String versionId, StartUploadDto input);
  Future<SignedPartsView> parts(String id, List<int> numbers);
  Future<AssetView> complete(String id, List<PartDto> parts);
  Future<AssetView> asset(String id);
  Future<AssetView> abort(String id);
  Future<DownloadView> download(String id);
  Future<PreviewStateView> previewStatus(String id);
  Future<PreviewStateView> previewRetry(String id);
  Future<PreviewView> preview(String id, int page);
  Future<PreviewStateView> manualPreview(String id, String sourceId);
  Future<PreviewStateView> removeManualPreview(String id);
  Future<PreviewStateView> retryScan(String id);
}

final filesRepositoryProvider = Provider<FilesRepository>((ref) {
  final auth = ref.watch(authRepositoryProvider) as HttpAuthRepository;
  return HttpFilesRepository(auth.api);
});

class HttpFilesRepository implements FilesRepository {
  final CofreClient api;
  const HttpFilesRepository(this.api);
  @override
  Future<PreviewStateView> retryScan(String id) =>
      api.filesscanRetry(const EmptyDto(), id);
  @override
  Future<PreviewStateView> manualPreview(String id, String sourceId) =>
      api.filesmanualPreview(ManualPreviewDto(previewAssetId: sourceId), id);
  @override
  Future<PreviewStateView> removeManualPreview(String id) =>
      api.filesremoveManualPreview(const EmptyDto(), id);
  @override
  Future<PreviewStateView> previewStatus(String id) =>
      api.filespreviewStatus(id);
  @override
  Future<PreviewStateView> previewRetry(String id) =>
      api.filespreviewRetry(const EmptyDto(), id);
  @override
  Future<PreviewView> preview(String id, int page) =>
      api.filespreview(PreviewPageDto(page: page), id);
  @override
  Future<StorageView> storage() => api.filesstorage();
  @override
  Future<VersionsView> versions(String projectId, {String? cursor}) =>
      api.filesversions(projectId, cursor: cursor);
  @override
  Future<VersionView> createVersion(String projectId) =>
      api.filescreateVersion(const EmptyDto(), projectId);
  @override
  Future<UploadView> start(String versionId, StartUploadDto input) =>
      api.filesstart(input, versionId);
  @override
  Future<SignedPartsView> parts(String id, List<int> numbers) =>
      api.filesparts(SignPartsDto(partNumbers: numbers), id);
  @override
  Future<AssetView> complete(String id, List<PartDto> parts) =>
      api.filescomplete(CompleteUploadDto(parts: parts), id);
  @override
  Future<AssetView> asset(String id) => api.filesgetUpload(id);
  @override
  Future<AssetView> abort(String id) => api.filesabort(const EmptyDto(), id);
  @override
  Future<DownloadView> download(String id) =>
      api.filesdownload(const EmptyDto(), id);
}
