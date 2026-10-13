import { randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import type { Database } from '@cofre/database';
import { serial } from './transactions.js';
import { QUOTA_MAX } from './file-types.js';
import type { ObjectStorage } from './storage.js';
import { previewProfile, previewSupported, temporalSupported } from './media.service.js';
export const PREVIEW_BUDGET = 32n * 1024n * 1024n;
type Page = { file: string; width: number; height: number; size: number; kind?: string; mime?: string; durationMs?: number };
export interface Renderer { render(source: string, mime: string, output: string, signal: AbortSignal): Promise<Page[]> }
export class PythonRenderer implements Renderer {
 constructor(private readonly python: string, private readonly script: string, private readonly ffmpeg = '', private readonly ffprobe = '') {}
 async render(source: string, mime: string, output: string, signal: AbortSignal) {
  // Credentials are deliberately absent from the parser's environment.
  const env: NodeJS.ProcessEnv = { SYSTEMROOT: process.env.SYSTEMROOT, WINDIR: process.env.WINDIR,
   TEMP: output, TMP: output, PATH: resolve(this.python, '..'), PYTHONUTF8: '1', MEDIA_FFMPEG: this.ffmpeg, MEDIA_FFPROBE: this.ffprobe };
  await new Promise<void>((done, fail) => {
   let error: Error | undefined;
   const child = spawn(this.python, ['-I', this.script, source, mime, output], {
    cwd: output, env, windowsHide: true, stdio: 'ignore', signal, timeout: 180000 });
   child.once('error', e => { error = e; });
   child.once('close', code => !error && code === 0 ? done() : fail(new Error('RENDER_FAILED')));
  });
  const manifest = join(output, 'manifest.json');
  if ((await stat(manifest)).size > 32768) throw new Error('INVALID_MANIFEST');
  const pages: unknown = JSON.parse(await readFile(manifest, 'utf8'));
  if (!Array.isArray(pages) || !pages.length || pages.length > 100) throw new Error('INVALID_MANIFEST');
  let total = 0;
  for (const [i, p] of pages.entries()) {
   const temporal = temporalSupported(mime);
   const video = mime === 'video/mp4';
   if (!p || (temporal ? pages.length !== 1 || p.file !== (video ? 'preview.mp4' : 'preview.m4a') || p.kind !== (video ? 'VIDEO' : 'AUDIO')
    || p.mime !== (video ? 'video/mp4' : 'audio/mp4') || !Number.isInteger(p.durationMs) || p.durationMs < 1 || p.durationMs > 60000
    : p.file !== `page-${i + 1}.jpg` || p.kind !== undefined || p.mime !== undefined || p.durationMs !== undefined)
    || !Number.isInteger(p.width) || !Number.isInteger(p.height)
    || p.width < (temporal && !video ? 0 : 1) || p.height < (temporal && !video ? 0 : 1) || p.width > 1600 || p.height > 1600
    || (temporal && (video ? p.width > 1280 || p.height > 720 : p.width !== 0 || p.height !== 0))
    || !Number.isInteger(p.size) || p.size < 1) throw new Error('INVALID_MANIFEST');
   const info = await stat(join(output, p.file));
   if (!info.isFile() || info.size !== p.size) throw new Error('INVALID_MANIFEST');
   total += p.size;
  }
  if (total > Number(PREVIEW_BUDGET)) throw new Error('PREVIEW_TOO_LARGE');
  return pages as Page[];
 }
}
export class MediaWorker {
 constructor(private readonly db: Database, private readonly store: ObjectStorage, private readonly renderer: Renderer) {}
 async claim() {
  return serial(this.db, async tx => {
   const job = await tx.mediaJob.findFirst({ where: { state: 'PENDING', retryAt: { lte: new Date() },
    asset: { status: 'READY', version: { project: { status: 'ACTIVE' } } } }, orderBy: { createdAt: 'asc' }, include: { asset: true } });
   if (!job) return null;
   const w = await tx.workspace.findUniqueOrThrow({ where: { id: job.asset.workspaceId } });
   if (w.storageUsedBytes + w.storageReservedBytes + PREVIEW_BUDGET > QUOTA_MAX) {
    await tx.mediaJob.update({ where: { id: job.id }, data: { state: 'FAILED', failureCode: 'PREVIEW_QUOTA' } });
    return null;
   }
   await tx.mediaJob.update({ where: { id: job.id }, data: { state: 'RUNNING', attempts: { increment: 1 }, failureCode: null } });
   await tx.workspace.update({ where: { id: w.id }, data: { storageReservedBytes: { increment: PREVIEW_BUDGET } } });
   const run = await tx.mediaRun.create({ data: { id: randomUUID(), jobId: job.id, reservedBytes: PREVIEW_BUDGET,
    expiresAt: new Date(Date.now() + 600000) } });
   return { job, run };
  });
 }
 async cleanup() {
  // A run has a 5 minute hard deadline; recovery only starts after its 10 minute lease.
  const due = await this.db.mediaRun.findMany({ where: { state: { in: ['RUNNING', 'CLEANUP'] }, expiresAt: { lte: new Date() } }, take: 10,
   include: { job: { include: { asset: true } } } });
  for (const run of due) {
   try {
    for (const key of run.keys as string[]) await this.store.cleanup(key, null);
    await serial(this.db, async tx => {
     const ended = await tx.mediaRun.updateMany({ where: { id: run.id, state: { in: ['RUNNING', 'CLEANUP'] } }, data: { state: 'CLEANED', reservedBytes: 0 } });
     if (!ended.count) return;
     await tx.workspace.update({ where: { id: run.job.asset.workspaceId }, data: { storageReservedBytes: { decrement: run.reservedBytes } } });
     await tx.mediaJob.updateMany({ where: { id: run.jobId, state: 'RUNNING' }, data: {
      state: run.job.attempts < 3 ? 'PENDING' : 'FAILED', failureCode: 'PREVIEW_PROCESSING_FAILED', retryAt: new Date(Date.now() + 60000) } });
    });
   } catch {
    // Bound retry traffic while retaining the durable reservation.
    await this.db.mediaRun.updateMany({ where: { id: run.id, state: { in: ['RUNNING', 'CLEANUP'] } }, data: { expiresAt: new Date(Date.now() + 60000) } });
   }
  }
 }
 async tick() {
  await this.cleanup();
  // Backfill pre-migration validated assets without exposing write-on-GET behavior.
  const old = await this.db.asset.findMany({ where: { status: 'READY', mediaJob: null, version: { project: { status: 'ACTIVE' } } }, take: 20, select: { id: true, mime: true } });
  if (old.length) await this.db.mediaJob.createMany({ data: old.map(a => ({ assetId: a.id,
   profile: previewProfile(a.mime), state: previewSupported(a.mime) ? 'PENDING' as const : 'UNSUPPORTED' as const })), skipDuplicates: true });
  await this.db.mediaJob.updateMany({ where: { state: 'UNSUPPORTED', asset: { status: 'READY', mime: { in: ['video/mp4', 'audio/mpeg', 'audio/wav'] },
   version: { project: { status: 'ACTIVE' } } } }, data: { state: 'PENDING', profile: 'temporal-v1' } });
  const claimed = await this.claim();
  if (!claimed) return false;
  const { job, run } = claimed;
  const signal = AbortSignal.timeout(300000);
  let folder: string | undefined;
  try {
   if (!this.store.readToFile || !this.store.putPreview) throw new Error('STORAGE_ADAPTER_UNAVAILABLE');
   const scratch = join(tmpdir(), 'cofre-media');
   await mkdir(scratch, { recursive: true });
   // Only our dedicated scratch children, older than the maximum run duration.
   for (const entry of await readdir(scratch, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('run-')) continue;
    const path = join(scratch, entry.name);
    if ((await stat(path)).mtimeMs < Date.now() - 3600000) await rm(path, { recursive: true, force: true });
   }
   folder = await mkdtemp(join(scratch, 'run-'));
   const input = join(folder, 'input'); const output = join(folder, 'output');
   await mkdir(output);
   await this.store.readToFile(job.asset.objectKey, input, Number(job.asset.sizeBytes), signal);
   const pages = await this.renderer.render(input, job.asset.mime, output, signal);
   const keys = pages.map(p => `previews/${job.asset.workspaceId}/${job.id}/${run.id}/${p.file}`);
   // Durable output manifest BEFORE any external write: recovery knows exactly what to remove.
   const planned = await this.db.mediaRun.updateMany({ where: { id: run.id, state: 'RUNNING', expiresAt: { gt: new Date() } }, data: { keys } });
   if (!planned.count) throw new Error('LEASE_LOST');
   for (const [i, page] of pages.entries()) {
    signal.throwIfAborted();
    await this.store.putPreview(keys[i], await readFile(join(output, page.file)), signal, page.mime ?? 'image/jpeg');
   }
   signal.throwIfAborted();
   const bytes = BigInt(pages.reduce((n, p) => n + p.size, 0));
   if (bytes > run.reservedBytes) throw new Error('PREVIEW_TOO_LARGE');
   await serial(this.db, async tx => {
    const ended = await tx.mediaRun.updateMany({ where: { id: run.id, state: 'RUNNING', expiresAt: { gt: new Date() } }, data: { state: 'READY', reservedBytes: 0 } });
    if (!ended.count) throw new Error('LEASE_LOST');
    await tx.previewPage.createMany({ data: pages.map((p, i) => ({ jobId: job.id, number: i + 1, objectKey: keys[i],
     sizeBytes: BigInt(p.size), width: p.width, height: p.height, kind: p.kind ?? 'IMAGE', mime: p.mime ?? 'image/jpeg', durationMs: p.durationMs ?? null })) });
    await tx.mediaJob.update({ where: { id: job.id }, data: { state: 'READY', failureCode: null } });
    await tx.workspace.update({ where: { id: job.asset.workspaceId }, data: {
     storageReservedBytes: { decrement: run.reservedBytes }, storageUsedBytes: { increment: bytes } } });
   });
  } catch {
   await this.db.mediaRun.updateMany({ where: { id: run.id, state: 'RUNNING' }, data: { state: 'CLEANUP' } });
   await this.db.mediaJob.updateMany({ where: { id: job.id, state: 'RUNNING' }, data: { failureCode: 'PREVIEW_PROCESSING_FAILED' } });
  } finally {
   if (folder) await rm(folder, { recursive: true, force: true }).catch(() => undefined);
  }
  return true;
 }
}
