import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MediaWorker, PREVIEW_BUDGET, type Renderer } from '../src/media-worker.js';
import type { ObjectStorage } from '../src/storage.js';
import { QUOTA_MAX } from '../src/file-types.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const target = new URL(databaseUrl);
if (target.port !== '5433' || target.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');
test('prévias privadas: fila persistente, concorrência, falha e autorização', async t => {
 const objects = new Map<string, Uint8Array>(); let failPut = false; let failCleanup = false; let failRender = false;
 const store: ObjectStorage = {
  create: async () => 'u', signPart: async () => '', parts: async () => [], complete: async () => {}, head: async () => null,
  prefix: async () => new Uint8Array(), download: async () => 'https://original.invalid',
  readToFile: async (_key, path) => { await writeFile(path, 'source'); },
  putPreview: async (key, bytes) => { objects.set(key, bytes); if (failPut) throw new Error('Lost response'); },
  cleanup: async key => { if (failCleanup) throw new Error('Offline'); objects.delete(key); },
  preview: async () => 'https://preview.invalid/derivative.jpg',
 };
 const renderer: Renderer = { render: async (_source, _mime, output) => {
  if (failRender) throw new Error('Parser crashed');
  await writeFile(join(output, 'page-1.jpg'), Buffer.alloc(100));
  return [{ file: 'page-1.jpg', width: 100, height: 100, size: 100 }];
 } };
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { storage: store, quiet: true });
 const db = server.db; const http = server.app.getHttpServer(); const worker = new MediaWorker(db, store, renderer);
 const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
 const mutate = (path: string, body: object, cookie = '') => request(http).post('/api/v1' + path).set('Origin', 'http://localhost:8080')
  .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], cookie]).send(body);
 async function account() {
  const r = await mutate('/auth/register', { name: 'QA', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123', workspaceName: 'Media QA' }).expect(201);
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
  const client = await mutate('/clients', { name: 'QA', email: 'qa@example.com' }, cookie).expect(201);
  const project = await mutate('/projects', { clientId: client.body.id, title: 'Media QA', balanceCents: 0, includedRevisionRounds: 0 }, cookie).expect(201);
  const version = await mutate('/projects/' + project.body.id + '/versions', {}, cookie).expect(201);
  return { cookie, workspaceId: r.body.workspace.id as string, versionId: version.body.id as string, projectId: project.body.id as string };
 }
 try {
  const a = await account(); const b = await account();
  async function asset(mime = 'application/pdf') {
   const asset = await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: a.versionId, fileName: 'test.pdf', mime,
    sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date() } });
   await db.workspace.update({ where: { id: a.workspaceId }, data: { storageUsedBytes: { increment: 10n } } });
   return asset;
  }
  const first = await asset();
  await t.test('backfill e processamento geram derivado separado e contabilizam cota uma vez', async () => {
   assert.equal(await worker.tick(), true);
   const job = await db.mediaJob.findUniqueOrThrow({ where: { assetId: first.id }, include: { pages: true } });
   assert.equal(job.state, 'READY'); assert.equal(job.pages.length, 1);
   assert.notEqual(job.pages[0].objectKey, first.objectKey); assert.ok(objects.has(job.pages[0].objectKey));
   const w = await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } });
   assert.equal(w.storageUsedBytes, 110n); assert.equal(w.storageReservedBytes, 0n);
   assert.equal(await worker.tick(), false);
   assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } })).storageUsedBytes, 110n);
  });
  await t.test('prévia exige workspace, estado, página válida e CSRF; não retorna original nem chave', async () => {
   await request(http).get(`/api/v1/assets/${first.id}/preview-status`).set('Cookie', b.cookie).expect(404);
   await mutate(`/assets/${first.id}/preview`, { page: 1 }, b.cookie).expect(404);
   await request(http).post(`/api/v1/assets/${first.id}/preview`).set('Cookie', a.cookie).send({ page: 1 }).expect(403);
   for (const page of [0, 101, 1.5, '1']) await mutate(`/assets/${first.id}/preview`, { page }, a.cookie).expect(400);
   await mutate(`/assets/${first.id}/preview`, { page: 2 }, a.cookie).expect(409);
   const result = await mutate(`/assets/${first.id}/preview`, { page: 1 }, a.cookie).expect(200);
   assert.equal(result.body.url, 'https://preview.invalid/derivative.jpg'); assert.equal(result.body.pages, 1);
   assert.equal(result.body.objectKey, undefined);
  });
  await t.test('dois consumidores não reivindicam o mesmo job nem duplicam a reserva', async () => {
   const next = await asset(); await db.mediaJob.create({ data: { assetId: next.id } });
   const claims = await Promise.all([worker.claim(), worker.claim()]);
   assert.equal(claims.filter(Boolean).length, 1);
   assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } })).storageReservedBytes, PREVIEW_BUDGET);
   const run = claims.find(Boolean)!.run;
   await db.mediaRun.update({ where: { id: run.id }, data: { expiresAt: new Date(0) } });
   await worker.cleanup();
   assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } })).storageReservedBytes, 0n);
   await db.mediaJob.update({ where: { assetId: next.id }, data: { state: 'FAILED' } });
  });
  await t.test('perda de resposta ao gravar derivado conserva reserva até limpeza confirmada', async () => {
   const next = await asset(); failPut = true; failCleanup = true;
   await worker.tick();
   const job = await db.mediaJob.findUniqueOrThrow({ where: { assetId: next.id }, include: { runs: true } });
   assert.equal(job.state, 'RUNNING'); assert.equal(job.runs[0].state, 'CLEANUP');
   assert.equal((job.runs[0].keys as string[]).length, 1);
   await db.mediaRun.update({ where: { id: job.runs[0].id }, data: { expiresAt: new Date(0) } });
   await worker.cleanup();
   assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } })).storageReservedBytes, PREVIEW_BUDGET);
   failCleanup = false; failPut = false;
   await db.mediaRun.update({ where: { id: job.runs[0].id }, data: { expiresAt: new Date(0) } });
   await worker.cleanup();
   assert.equal(objects.has((job.runs[0].keys as string[])[0]), false);
   assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } })).storageReservedBytes, 0n);
   await db.mediaJob.update({ where: { id: job.id }, data: { retryAt: new Date(0) } });
   await worker.tick();
   assert.equal((await db.mediaJob.findUniqueOrThrow({ where: { id: job.id } })).state, 'READY');
  });
  await t.test('três falhas encerram retries automáticos e retry manual é explícito', async () => {
   const next = await asset(); failRender = true;
   for (let i = 0; i < 3; i++) {
    await worker.tick();
    const job = await db.mediaJob.findUniqueOrThrow({ where: { assetId: next.id } });
    await db.mediaRun.updateMany({ where: { jobId: job.id, state: 'CLEANUP' }, data: { expiresAt: new Date(0) } });
    await worker.cleanup();
    await db.mediaJob.update({ where: { id: job.id }, data: { retryAt: new Date(0) } });
   }
   assert.equal((await db.mediaJob.findUniqueOrThrow({ where: { assetId: next.id } })).state, 'FAILED');
   await mutate(`/assets/${next.id}/preview`, { page: 1 }, a.cookie).expect(409);
   await mutate(`/assets/${next.id}/preview-retry`, {}, b.cookie).expect(404);
   await mutate(`/assets/${next.id}/preview-retry`, {}, a.cookie).expect(200);
   failRender = false; await worker.tick();
   assert.equal((await db.mediaJob.findUniqueOrThrow({ where: { assetId: next.id } })).state, 'READY');
  });
  await t.test('ZIP não é enviado a parser; projeto arquivado bloqueia emissão de prévia', async () => {
   const zip = await asset('application/zip'); await worker.tick();
   assert.equal((await db.mediaJob.findUniqueOrThrow({ where: { assetId: zip.id } })).state, 'UNSUPPORTED');
   await mutate(`/assets/${zip.id}/preview`, { page: 1 }, a.cookie).expect(409);
   await mutate('/projects/' + a.projectId + '/archive', {}, a.cookie).expect(200);
   await mutate(`/assets/${first.id}/preview`, { page: 1 }, a.cookie).expect(409);
  });
  await t.test('cota insuficiente falha sem reservar nem iniciar parser', async () => {
   await db.project.update({ where: { id: a.projectId }, data: { status: 'ACTIVE' } });
   const next = await asset();
   await db.workspace.update({ where: { id: a.workspaceId }, data: { storageUsedBytes: QUOTA_MAX - 1n } });
   await worker.tick();
   const job = await db.mediaJob.findUniqueOrThrow({ where: { assetId: next.id } });
   assert.equal(job.state, 'FAILED'); assert.equal(job.failureCode, 'PREVIEW_QUOTA');
   assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } })).storageReservedBytes, 0n);
  });
 } finally { await server.close(); }
});
