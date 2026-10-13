import { ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Database } from '@cofre/database';
import { DATABASE } from './config.js';
import { STORAGE, type ObjectStorage } from './storage.js';
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
 async state(workspaceId: string, id: string) {
  const a = await this.asset(workspaceId, id);
  if (a.status !== 'READY') throw new ConflictException({ code: 'UPLOAD_NOT_READY', message: 'Aguarde a conclusão do envio.' });
  const job = await this.db.mediaJob.findUnique({ where: { assetId: id }, include: { _count: { select: { pages: true } } } });
  return { state: job?.state ?? (previewSupported(a.mime) ? 'PENDING' : 'UNSUPPORTED'), failureCode: job?.failureCode ?? null, pages: job?._count.pages ?? 0 };
 }
 async retry(workspaceId: string, id: string) {
  const a = await this.asset(workspaceId, id);
  if (a.version.project.status !== 'ACTIVE') throw new ConflictException({ code: 'PROJECT_ARCHIVED', message: 'Projeto arquivado.' });
  const result = await this.db.mediaJob.updateMany({ where: { assetId: id, state: 'FAILED', runs: { none: { state: { in: ['RUNNING', 'CLEANUP'] } } } },
   data: { state: 'PENDING', attempts: 0, retryAt: new Date(), failureCode: null } });
  if (!result.count) throw new ConflictException({ code: 'PREVIEW_NOT_RETRYABLE', message: 'Aguarde o processamento ou a limpeza antes de tentar novamente.' });
  return this.state(workspaceId, id);
 }
 async preview(workspaceId: string, id: string, page: number) {
  const a = await this.asset(workspaceId, id);
  const job = await this.db.mediaJob.findUnique({ where: { assetId: id }, include: { pages: { orderBy: { number: 'asc' } } } });
  if (a.status !== 'READY' || a.version.project.status !== 'ACTIVE' || job?.state !== 'READY' || !job.pages[page - 1]) {
   throw new ConflictException({ code: 'PREVIEW_NOT_READY', message: 'A prévia ainda não está disponível.' });
  }
  if (!this.storage?.preview) throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Prévia indisponível. Tente novamente.' });
  const derivative = job.pages[page - 1];
  try { return { url: await this.storage.preview(derivative.objectKey, derivative.mime), expiresAt: new Date(Date.now() + 60000), page, pages: job.pages.length,
   kind: derivative.kind, mime: derivative.mime, durationMs: derivative.durationMs }; }
  catch { throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Prévia indisponível. Tente novamente.' }); }
 }
}
