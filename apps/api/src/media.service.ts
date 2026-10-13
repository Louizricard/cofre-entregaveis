import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Database } from '@cofre/database';
import { DATABASE } from './config.js';
import { STORAGE, type ObjectStorage } from './storage.js';
import { serial } from './transactions.js';
import { cleanScan } from './security-worker.js';
const manualTypes = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
export const MEDIA_PROFILE = 'image-pdf-v1';
export const temporalSupported = (mime: string) => ['video/mp4', 'audio/mpeg', 'audio/wav'].includes(mime);
export const previewSupported = (mime: string) => ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(mime) || temporalSupported(mime);
export const previewProfile = (mime: string) => temporalSupported(mime) ? 'temporal-v1' : MEDIA_PROFILE;
@Injectable()
export class MediaService {
 constructor(@Inject(DATABASE) private readonly db: Database, @Inject(STORAGE) private readonly storage: ObjectStorage | null) {}
 private async asset(workspaceId: string, id: string) {
  const asset = await this.db.asset.findFirst({ where: { id, workspaceId }, include: { version: { include: { project: true } } } });
  if (!asset) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
  return asset;
 }
 private async sourceId(workspaceId: string, assetId: string) {
  const manual = await this.db.manualPreview.findFirst({ where: { assetId, workspaceId } });
  return manual?.sourceAssetId ?? assetId;
 }
 async manual(workspaceId: string, id: string, sourceId: string | null) {
  await serial(this.db, async tx => {
   const asset = await tx.asset.findFirst({ where: { id, workspaceId }, include: { version: { include: { project: true } } } });
   if (!asset) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
   if (asset.version.state !== 'DRAFT') throw new ConflictException({ code: 'VERSION_IMMUTABLE', message: 'A prévia manual de uma versão publicada não pode ser alterada.' });
   if (asset.status !== 'READY' || asset.mime !== 'application/zip') throw new ConflictException({ code: 'MANUAL_PREVIEW_TARGET', message: 'A prévia manual requer um ZIP com envio concluído.' });
   if (asset.version.project.status !== 'ACTIVE') throw new ConflictException({ code: 'PROJECT_ARCHIVED', message: 'Projeto arquivado.' });
   if (!cleanScan(asset)) throw new ConflictException({ code: 'SECURITY_SCAN_REQUIRED', message: 'Aguarde a análise de segurança do ZIP.' });
   await tx.project.update({ where: { id: asset.version.projectId }, data: { revision: { increment: 1 } } });
   if (!sourceId) { await tx.manualPreview.deleteMany({ where: { assetId: id, workspaceId } }); return; }
   const source = await tx.asset.findFirst({ where: { id: sourceId, workspaceId, versionId: asset.versionId } });
   if (!source) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Selecione um arquivo desta versão.' });
   if (source.id === id || source.status !== 'READY' || !manualTypes.includes(source.mime)) throw new ConflictException({ code: 'MANUAL_PREVIEW_SOURCE', message: 'Selecione uma imagem estática ou PDF com envio concluído.' });
   if (!cleanScan(source)) throw new ConflictException({ code: 'SECURITY_SCAN_REQUIRED', message: 'Aguarde a análise de segurança da fonte.' });
   await tx.manualPreview.upsert({ where: { assetId: id }, create: { assetId: id, workspaceId, versionId: asset.versionId, sourceAssetId: sourceId }, update: { sourceAssetId: sourceId } });
  });
  return this.state(workspaceId, id);
 }
 async state(workspaceId: string, id: string) {
  const a = await this.asset(workspaceId, id);
  if (a.status !== 'READY') throw new ConflictException({ code: 'UPLOAD_NOT_READY', message: 'Aguarde a conclusão do envio.' });
  const sourceId = await this.sourceId(workspaceId, id);
  const source = sourceId === id ? a : await this.asset(workspaceId, sourceId);
  if (!cleanScan(a) || !cleanScan(source)) {
   const rejected = a.scanStatus === 'REJECTED' || source.scanStatus === 'REJECTED';
   const error = a.scanStatus === 'ERROR' || source.scanStatus === 'ERROR';
   return { state: rejected || error ? 'FAILED' : 'PENDING', failureCode: rejected ? 'SECURITY_REJECTED' : error ? 'SECURITY_SCAN_ERROR' : 'SECURITY_SCAN_REQUIRED', pages: 0 };
  }
  const job = await this.db.mediaJob.findUnique({ where: { assetId: sourceId }, include: { _count: { select: { pages: true } } } });
  return { state: job?.state ?? (sourceId !== id || previewSupported(a.mime) ? 'PENDING' : 'UNSUPPORTED'), failureCode: job?.failureCode ?? null, pages: job?._count.pages ?? 0 };
 }
 async retry(workspaceId: string, id: string) {
  const a = await this.asset(workspaceId, id);
  if (a.version.project.status !== 'ACTIVE') throw new ConflictException({ code: 'PROJECT_ARCHIVED', message: 'Projeto arquivado.' });
  const sourceId = await this.sourceId(workspaceId, id);
  const source = sourceId === id ? a : await this.asset(workspaceId, sourceId);
  if (!cleanScan(a) || !cleanScan(source)) throw new ConflictException({ code: 'SECURITY_SCAN_REQUIRED', message: 'Conclua a análise de segurança antes de reprocessar.' });
  const result = await this.db.mediaJob.updateMany({ where: { assetId: sourceId, state: 'FAILED', runs: { none: { state: { in: ['RUNNING', 'CLEANUP'] } } } },
   data: { state: 'PENDING', attempts: 0, retryAt: new Date(), failureCode: null } });
  if (!result.count) throw new ConflictException({ code: 'PREVIEW_NOT_RETRYABLE', message: 'Aguarde o processamento ou a limpeza antes de tentar novamente.' });
  return this.state(workspaceId, id);
 }
 async preview(workspaceId: string, id: string, page: number) {
  const a = await this.asset(workspaceId, id);
  const sourceId = await this.sourceId(workspaceId, id);
  const source = sourceId === id ? a : await this.asset(workspaceId, sourceId);
  if (!cleanScan(a) || !cleanScan(source)) throw new ConflictException({ code: 'SECURITY_SCAN_REQUIRED', message: 'A prévia aguarda análise de segurança ou foi bloqueada.' });
  const job = await this.db.mediaJob.findUnique({ where: { assetId: sourceId }, include: { pages: { orderBy: { number: 'asc' } } } });
  if (a.status !== 'READY' || a.version.project.status !== 'ACTIVE' || job?.state !== 'READY' || !job.pages[page - 1]) {
   throw new ConflictException({ code: 'PREVIEW_NOT_READY', message: 'A prévia ainda não está disponível.' });
  }
  if (!this.storage?.preview) throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Prévia indisponível. Tente novamente.' });
  const derivative = job.pages[page - 1];
  try { return { url: await this.storage.preview(derivative.objectKey, derivative.mime), expiresAt: new Date(Date.now() + 60000), page, pages: job.pages.length,
   kind: derivative.kind, mime: derivative.mime, durationMs: derivative.durationMs }; }
  catch { throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Prévia indisponível. Tente novamente.' }); }
 }
 async retryScan(workspaceId: string, id: string) {
  const a = await this.asset(workspaceId, id);
  if (a.status !== 'READY' || a.version.project.status !== 'ACTIVE') throw new ConflictException({ code: 'SCAN_NOT_RETRYABLE', message: 'Operação indisponível.' });
  const result = await this.db.asset.updateMany({ where: { id, workspaceId, scanStatus: 'ERROR' }, data: { scanStatus: 'PENDING', scanAttempts: 0, scanRetryAt: new Date() } });
  if (!result.count) throw new ConflictException({ code: 'SCAN_NOT_RETRYABLE', message: 'Aguarde a análise. Arquivos rejeitados permanecem bloqueados.' });
  return this.state(workspaceId, id);
 }
}
