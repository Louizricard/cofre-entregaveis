import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, ServiceUnavailableException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Database, Prisma } from '@cofre/database';
import { createHash, randomUUID } from 'node:crypto';
import { DATABASE } from './config.js';
import { STORAGE, type ObjectStorage } from './storage.js';
import { serial } from './transactions.js';
import { extensions, FILE_MAX, matchesSignature, PART_SIZE, QUOTA_MAX, validDeclaredType } from './file-types.js';
import type { AssetView, CompleteUploadDto, StartUploadDto } from './files.dto.js';
import type { ListQuery } from './projects.dto.js';
import { previewSupported, previewProfile } from './media.service.js';
import { cleanScan } from './security-worker.js';

export const MAINTENANCE = Symbol('MAINTENANCE');
const activeStates = ['INITIATING', 'UPLOADING', 'COMPLETING', 'VALIDATING'] as const;
const assetInclude = { version: { include: { project: true } } } as const;
type Asset = Prisma.AssetGetPayload<{ include: typeof assetInclude }>;
function view(a: { id: string; fileName: string; mime: string; sizeBytes: bigint; status: string; failureCode: string | null; expiresAt: Date; scanStatus: string; scannedAt: Date | null }): AssetView {
 return { id: a.id, fileName: a.fileName, mime: a.mime, sizeBytes: a.sizeBytes.toString(), status: a.status, failureCode: a.failureCode, expiresAt: a.expiresAt,
  scanStatus: a.scanStatus === 'CLEAN' && !cleanScan(a) ? 'PENDING' : a.scanStatus };
}
const conflict = (code: string, message: string) => new ConflictException({ code, message });
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
const unavailable = () => new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Armazenamento indisponível. Tente novamente.' });
const leaseAvailable = () => ({ OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] });
const etag = (value: string) => value.replace(/^"|"$/g, '');

@Injectable()
export class FilesService implements OnModuleInit, OnModuleDestroy {
 private timer?: NodeJS.Timeout;
 private sweeping = false;
 private sweepTask?: Promise<void>;
 constructor(@Inject(DATABASE) private readonly db: Database,
  @Inject(STORAGE) private readonly storage: ObjectStorage | null,
  @Inject(MAINTENANCE) private readonly maintenance: boolean) {}
 onModuleInit() {
  if (this.storage && this.maintenance) {
   this.timer = setInterval(() => {
    if (this.sweeping) return;
    this.sweepTask = this.sweep().catch(() => console.warn('{"event":"storage_cleanup_retry"}'));
   }, 60000);
   this.timer.unref();
  }
 }
 async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.sweepTask; this.storage?.close?.(); }
 private store() {
  if (!this.storage) throw new ServiceUnavailableException({ code: 'STORAGE_NOT_CONFIGURED', message: 'O armazenamento de arquivos ainda não foi configurado.' });
  return this.storage;
 }
 async capabilities(workspaceId: string) {
  const w = await this.db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
  return { enabled: !!this.storage, maxFileBytes: FILE_MAX.toString(), quotaBytes: QUOTA_MAX.toString(),
   usedBytes: w.storageUsedBytes.toString(), reservedBytes: w.storageReservedBytes.toString(), activeUploads: w.activeUploads,
   maxActiveUploads: 5, mimeTypes: Object.keys(extensions) };
 }
 private async activeProject(tx: Prisma.TransactionClient, workspaceId: string, projectId: string) {
  const project = await tx.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) throw missing();
  if (project.status !== 'ACTIVE') throw conflict('PROJECT_ARCHIVED', 'Projetos arquivados permitem apenas consulta.');
  // Serialize file mutations against archive/createVersion on the same project.
  await tx.project.update({ where: { id: projectId }, data: { revision: { increment: 1 } } });
 }
 async createVersion(workspaceId: string, projectId: string) {
  return serial(this.db, async tx => {
   await this.activeProject(tx, workspaceId, projectId);
   const project = await tx.project.findUniqueOrThrow({ where: { id: projectId } });
   const last = await tx.projectVersion.findFirst({ where: { projectId, workspaceId }, orderBy: { number: 'desc' } });
   const v = await tx.projectVersion.create({ data: { workspaceId, projectId, number: (last?.number ?? 0) + 1 } });
   return { id: v.id, number: v.number, state: v.state, projectRevision: project.revision, createdAt: v.createdAt, assets: [] };
  });
 }
 async versions(workspaceId: string, projectId: string, query: ListQuery) {
  const project = await this.db.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) throw missing();
  const cursor = query.cursor ? await this.db.projectVersion.findFirst({ where: { id: query.cursor, projectId, workspaceId } }) : null;
  if (query.cursor && !cursor) throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Paginação inválida.' });
  const limit = query.limit ?? 20;
  const rows = await this.db.projectVersion.findMany({ where: { projectId, workspaceId, ...(cursor ? { number: { gt: cursor.number } } : {}) },
   orderBy: { number: 'asc' }, take: limit + 1, include: { assets: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] } } });
  return { items: rows.slice(0, limit).map(v => ({ id: v.id, number: v.number, state: v.state, projectRevision: project.revision, createdAt: v.createdAt, assets: v.assets.map(view) })),
   nextCursor: rows.length > limit ? rows[limit - 1].id : null };
 }
 async publish(workspaceId: string, userId: string, id: string, expectedProjectRevision: number) {
  return serial(this.db, async tx => {
   const version = await tx.projectVersion.findFirst({ where: { id, workspaceId }, include: { project: true, assets: { include: { mediaJob: true } } } });
   if (!version) throw missing();
   if (version.project.status !== 'ACTIVE') throw conflict('PROJECT_ARCHIVED', 'Projeto arquivado.');
   if (version.state !== 'DRAFT') throw conflict('VERSION_IMMUTABLE', 'Esta versão já foi publicada.');
   if (version.project.revision !== expectedProjectRevision) throw conflict('PROJECT_CHANGED', 'O projeto mudou. Atualize os arquivos antes de publicar.');
   const current = await tx.projectVersion.findFirst({ where: { projectId: version.projectId, state: 'PUBLISHED' } });
   if (current && current.number >= version.number) throw conflict('VERSION_OUTDATED', 'Publique uma versão mais recente que a atual.');
   if (version.assets.some(a => !['READY', 'ABORTED', 'FAILED'].includes(a.status))) throw conflict('UPLOAD_PENDING', 'Conclua ou cancele os envios antes de publicar.');
   const files = version.assets.filter(a => a.status === 'READY');
   if (!files.length) throw conflict('VERSION_EMPTY', 'Envie ao menos um arquivo antes de publicar.');
   if (files.some(a => !cleanScan(a))) throw conflict('SECURITY_SCAN_REQUIRED', 'Aguarde a análise de segurança de todos os arquivos.');
   if (files.some(a => previewSupported(a.mime) && a.mediaJob?.state !== 'READY')) throw conflict('PREVIEW_NOT_READY', 'Aguarde as prévias ou reprocesse as falhas antes de publicar.');
   await tx.project.update({ where: { id: version.projectId }, data: { revision: { increment: 1 } } });
   await tx.projectVersion.updateMany({ where: { projectId: version.projectId, state: 'PUBLISHED' }, data: { state: 'SUPERSEDED' } });
   const result = await tx.projectVersion.update({ where: { id }, data: { state: 'PUBLISHED', publishedAt: new Date(), publishedById: userId } });
   return { id, number: result.number, state: result.state, projectRevision: expectedProjectRevision + 1, createdAt: result.createdAt, assets: version.assets.map(view) };
  });
 }
 private async get(workspaceId: string, id: string) {
  const a = await this.db.asset.findFirst({ where: { id, workspaceId }, include: assetInclude });
  if (!a) throw missing();
  return a;
 }
 async asset(workspaceId: string, id: string) { return view(await this.get(workspaceId, id)); }
 private async claim(workspaceId: string, id: string, states: string[], allowArchived = false) {
  const token = randomUUID();
  const a = await serial(this.db, async tx => {
   const a = await tx.asset.findFirst({ where: { id, workspaceId }, include: assetInclude });
   if (!a) throw missing();
   if (!states.includes(a.status)) throw conflict('UPLOAD_STATE', 'Esta operação não está disponível para o arquivo.');
   if (!allowArchived) {
    if (a.expiresAt.getTime() <= Date.now()) throw conflict('UPLOAD_EXPIRED', 'O envio expirou. Cancele e inicie novamente.');
    await this.activeProject(tx, workspaceId, a.version.projectId);
   }
   const locked = await tx.asset.updateMany({ where: { id, ...leaseAvailable() }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 180000) } });
   if (!locked.count) throw conflict('UPLOAD_BUSY', 'Uma operação está em andamento. Aguarde e tente novamente.');
   return a;
  });
  return { a, token };
 }
 private async unlock(id: string, token: string) {
  await this.db.asset.updateMany({ where: { id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
 }
 async start(workspaceId: string, versionId: string, dto: StartUploadDto) {
  const store = this.store();
  const size = BigInt(dto.sizeBytes);
  if (size > FILE_MAX || !validDeclaredType(dto.fileName, dto.declaredMime) || !dto.fileName.trim()) {
   throw new BadRequestException({ code: 'FILE_REJECTED', message: 'Use um formato permitido, com tamanho de até 2 GiB.' });
  }
  const id = randomUUID(); const token = randomUUID();
  const a = await serial(this.db, async tx => {
   const version = await tx.projectVersion.findFirst({ where: { id: versionId, workspaceId } });
   if (!version) throw missing();
   if (version.state !== 'DRAFT') throw conflict('VERSION_IMMUTABLE', 'Esta versão foi publicada. Crie uma nova versão para enviar arquivos.');
   await this.activeProject(tx, workspaceId, version.projectId);
   const w = await tx.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
   if (w.activeUploads >= 5) throw conflict('UPLOAD_LIMIT', 'Há cinco envios em andamento. Aguarde ou cancele um deles.');
   if (w.storageUsedBytes + w.storageReservedBytes + size > QUOTA_MAX) throw conflict('QUOTA_EXCEEDED', 'Não há espaço disponível no workspace.');
   if (await tx.asset.count({ where: { versionId } }) >= 100) throw conflict('VERSION_FILE_LIMIT', 'Esta versão atingiu o limite de 100 registros de arquivo.');
   await tx.workspace.update({ where: { id: workspaceId }, data: { storageReservedBytes: { increment: size }, activeUploads: { increment: 1 } } });
   return tx.asset.create({ data: { id, workspaceId, versionId, fileName: dto.fileName, mime: dto.declaredMime, sizeBytes: size,
    objectKey: `${workspaceId}/${versionId}/${id}`, expiresAt: new Date(Date.now() + 86400000), leaseToken: token, leaseUntil: new Date(Date.now() + 180000) } });
  });
  try {
   const multipartId = await store.create(a.objectKey, a.mime, a.id);
   const updated = await this.db.asset.updateMany({ where: { id, leaseToken: token, status: 'INITIATING' }, data: { multipartId, status: 'UPLOADING', leaseToken: null, leaseUntil: null } });
   if (!updated.count) throw unavailable();
   return { asset: view(await this.get(workspaceId, id)), partSizeBytes: PART_SIZE, partCount: Math.ceil(Number(size) / PART_SIZE) };
  } catch {
   await this.db.asset.updateMany({ where: { id, leaseToken: token }, data: { status: 'ABORTING', failureCode: 'INITIATION_FAILED', leaseToken: null, leaseUntil: null } });
   await this.cleanup(id).catch(() => undefined);
   throw unavailable();
  }
 }
 async signParts(workspaceId: string, id: string, numbers: number[]) {
  const store = this.store(); const { a, token } = await this.claim(workspaceId, id, ['UPLOADING']);
  try {
   const count = Math.ceil(Number(a.sizeBytes) / PART_SIZE);
   if (!a.multipartId || numbers.some(n => n > count)) throw new BadRequestException({ code: 'INVALID_PART', message: 'Parte de arquivo inválida.' });
   return { parts: await Promise.all(numbers.map(async n => ({ partNumber: n,
    url: await store.signPart(a.objectKey, a.multipartId!, n, n === count ? Number(a.sizeBytes) - PART_SIZE * (n - 1) : PART_SIZE) }))), expiresAt: new Date(Date.now() + 300000) };
  } catch (e) { if (e instanceof BadRequestException) throw e; throw unavailable(); }
  finally { await this.unlock(id, token); }
 }
 async complete(workspaceId: string, id: string, dto: CompleteUploadDto) {
  const store = this.store();
  const requested = [...dto.parts].sort((a, b) => a.partNumber - b.partNumber);
  const hash = createHash('sha256').update(JSON.stringify(requested.map(p => ({ partNumber: p.partNumber, etag: etag(p.etag) })))).digest('hex');
  const current = await this.get(workspaceId, id);
  if (current.completionHash && current.completionHash !== hash) throw conflict('COMPLETION_CHANGED', 'Use a mesma lista de partes ao repetir a conclusão.');
  if (current.status === 'READY') {
   if (current.version.project.status !== 'ACTIVE') throw conflict('PROJECT_ARCHIVED', 'Projeto arquivado.');
   return view(current);
  }
  const { a, token } = await this.claim(workspaceId, id, ['UPLOADING', 'COMPLETING', 'VALIDATING']);
  try {
   if (!a.multipartId || requested.length !== Math.ceil(Number(a.sizeBytes) / PART_SIZE) || requested.some((p, i) => p.partNumber !== i + 1)) {
    throw new BadRequestException({ code: 'INVALID_PARTS', message: 'Informe todas as partes, sem duplicação.' });
   }
   // Re-check after claiming: another completion may have finished between reads.
   if (a.completionHash && a.completionHash !== hash) throw conflict('COMPLETION_CHANGED', 'A lista de partes mudou.');
   let head = await store.head(a.objectKey);
   if (!head) {
    const actual = await store.parts(a.objectKey, a.multipartId);
    if (actual.length !== requested.length || actual.some((p, i) => p.partNumber !== requested[i].partNumber || etag(p.etag) !== etag(requested[i].etag)
     || p.size !== (i === actual.length - 1 ? Number(a.sizeBytes) - PART_SIZE * i : PART_SIZE))) {
     throw new BadRequestException({ code: 'PARTS_MISMATCH', message: 'As partes recebidas não correspondem ao envio. Reenvie as partes e tente novamente.' });
    }
    await this.db.asset.updateMany({ where: { id, leaseToken: token }, data: { status: 'COMPLETING', completionHash: hash } });
    await store.complete(a.objectKey, a.multipartId, requested);
    head = await store.head(a.objectKey);
   }
   await this.db.asset.updateMany({ where: { id, leaseToken: token }, data: { status: 'VALIDATING', completionHash: hash } });
   if (!head || head.size !== Number(a.sizeBytes) || head.mime !== a.mime || head.assetId !== a.id || !matchesSignature(await store.prefix(a.objectKey), a.mime)) {
    await this.db.asset.updateMany({ where: { id, leaseToken: token }, data: { status: 'ABORTING', failureCode: 'OBJECT_REJECTED', leaseToken: null, leaseUntil: null } });
    await this.cleanup(id).catch(() => undefined);
    throw new BadRequestException({ code: 'OBJECT_REJECTED', message: 'O arquivo recebido não passou na validação de tamanho e formato.' });
   }
   return await serial(this.db, async tx => {
    await this.activeProject(tx, workspaceId, a.version.projectId);
    const result = await tx.asset.updateMany({ where: { id, leaseToken: token, status: 'VALIDATING' }, data: { status: 'READY', leaseToken: null, leaseUntil: null } });
    if (!result.count) throw conflict('UPLOAD_STATE', 'A operação mudou. Atualize a lista.');
    await tx.workspace.update({ where: { id: workspaceId }, data: { storageReservedBytes: { decrement: a.sizeBytes }, storageUsedBytes: { increment: a.sizeBytes }, activeUploads: { decrement: 1 } } });
    await tx.mediaJob.upsert({ where: { assetId: id }, create: { assetId: id, profile: previewProfile(a.mime), state: previewSupported(a.mime) ? 'PENDING' : 'UNSUPPORTED' }, update: {} });
    return view(await tx.asset.findUniqueOrThrow({ where: { id } }));
   });
  } catch (e) {
   if (e instanceof BadRequestException || e instanceof ConflictException) throw e;
   throw unavailable();
  } finally { await this.unlock(id, token); }
 }
 async abort(workspaceId: string, id: string) {
  this.store(); const a = await this.get(workspaceId, id);
  if (['ABORTED', 'FAILED'].includes(a.status)) return view(a);
  const claimed = await this.claim(workspaceId, id, [...activeStates, 'ABORTING'], true);
  await this.db.asset.updateMany({ where: { id, leaseToken: claimed.token }, data: { status: 'ABORTING', leaseToken: null, leaseUntil: null, retryAt: new Date() } });
  await this.cleanup(id);
  return view(await this.get(workspaceId, id));
 }
 private async cleanup(id: string) {
  const store = this.store();
  const candidate = await this.db.asset.findUniqueOrThrow({ where: { id } });
  const token = randomUUID();
  const claimed = await this.db.asset.updateMany({ where: { id, status: 'ABORTING', ...leaseAvailable() }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + 180000) } });
  if (!claimed.count) return;
  try {
   await store.cleanup(candidate.objectKey, candidate.multipartId);
   await serial(this.db, async tx => {
    const ended = await tx.asset.updateMany({ where: { id, status: 'ABORTING', leaseToken: token }, data: { status: candidate.failureCode ? 'FAILED' : 'ABORTED', leaseToken: null, leaseUntil: null } });
    if (ended.count) await tx.workspace.update({ where: { id: candidate.workspaceId }, data: { storageReservedBytes: { decrement: candidate.sizeBytes }, activeUploads: { decrement: 1 } } });
   });
  } catch {
   await this.db.asset.updateMany({ where: { id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null,
    cleanupAttempts: { increment: 1 }, retryAt: new Date(Date.now() + Math.min(3600000, 60000 * 2 ** Math.min(candidate.cleanupAttempts, 6))) } });
  }
 }
 async sweep() {
  if (!this.storage || this.sweeping) return;
  this.sweeping = true;
  try {
   await this.db.asset.updateMany({ where: { status: { in: [...activeStates] }, expiresAt: { lt: new Date() }, ...leaseAvailable() },
    data: { status: 'ABORTING', failureCode: 'UPLOAD_EXPIRED', retryAt: new Date(), leaseToken: null, leaseUntil: null } });
   const due = await this.db.asset.findMany({ where: { status: 'ABORTING', retryAt: { lte: new Date() }, ...leaseAvailable() }, orderBy: { retryAt: 'asc' }, take: 20, select: { id: true } });
   for (const a of due) await this.cleanup(a.id);
  } finally { this.sweeping = false; }
 }
 async download(workspaceId: string, id: string) {
  const store = this.store(); const a: Asset = await this.get(workspaceId, id);
  if (a.status !== 'READY' || a.version.project.status !== 'ACTIVE') throw conflict('DOWNLOAD_NOT_AVAILABLE', 'O arquivo não está disponível para download.');
  if (!cleanScan(a)) throw conflict('SECURITY_SCAN_REQUIRED', 'O arquivo aguarda uma análise de segurança válida ou foi bloqueado.');
  try { return { url: await store.download(a.objectKey, a.fileName), expiresAt: new Date(Date.now() + 60000) }; }
  catch { throw unavailable(); }
 }
}
