import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { MediaWorker, PREVIEW_BUDGET, type Renderer } from '../src/media-worker.js';
import type { ObjectStorage } from '../src/storage.js';
import { QUOTA_MAX } from '../src/file-types.js';
import { SecurityWorker, type Scanner } from '../src/security-worker.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const target = new URL(databaseUrl);
if (target.port !== '5433' || target.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');
test('prévias privadas: fila persistente, concorrência, falha e autorização', async t => {
 const objects = new Map<string, Uint8Array>(); let failPut = false; let failCleanup = false; let failRender = false; let changedSource = false;
 const store: ObjectStorage = {
  create: async () => 'u', signPart: async () => '', parts: async () => [], complete: async () => {}, head: async () => null,
  prefix: async () => new Uint8Array(), download: async () => 'https://original.invalid',
  readToFile: async (_key, path) => { await writeFile(path, changedSource ? 'changed' : 'source'); },
  putPreview: async (key, bytes) => { objects.set(key, bytes); if (failPut) throw new Error('Lost response'); },
  cleanup: async key => { if (failCleanup) throw new Error('Offline'); objects.delete(key); },
  preview: async () => 'https://preview.invalid/derivative.jpg',
 };
 const renderer: Renderer = { render: async (_source, _mime, output) => {
  if (failRender) throw new Error('Parser crashed');
  if (['video/mp4', 'audio/wav', 'audio/mpeg'].includes(_mime)) {
   const video = _mime === 'video/mp4'; const file = video ? 'preview.mp4' : 'preview.m4a';
   await writeFile(join(output, file), Buffer.alloc(200));
   return [{ file, width: video ? 1280 : 0, height: video ? 720 : 0, size: 200, kind: video ? 'VIDEO' : 'AUDIO', mime: video ? 'video/mp4' : 'audio/mp4', durationMs: 3000 }];
  }
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
    sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: createHash('sha256').update('source').digest('hex') } });
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
  await t.test('vídeo e áudio têm metadados, MIME e chaves próprios; suporte anterior é reprocessado', async () => {
   await db.project.update({ where: { id: a.projectId }, data: { status: 'ACTIVE' } });
   for (const mime of ['video/mp4', 'audio/wav', 'audio/mpeg']) {
    const next = await asset(mime);
    await db.mediaJob.create({ data: { assetId: next.id, state: 'UNSUPPORTED' } });
    await worker.tick();
    const job = await db.mediaJob.findUniqueOrThrow({ where: { assetId: next.id }, include: { pages: true } });
    assert.equal(job.state, 'READY'); assert.equal(job.profile, 'temporal-v1');
    const result = await mutate(`/assets/${next.id}/preview`, { page: 1 }, a.cookie).expect(200);
    assert.equal(result.body.kind, mime === 'video/mp4' ? 'VIDEO' : 'AUDIO');
    assert.equal(result.body.mime, mime === 'video/mp4' ? 'video/mp4' : 'audio/mp4');
    assert.equal(result.body.durationMs, 3000); assert.notEqual(job.pages[0].objectKey, next.objectKey);
    await mutate(`/assets/${next.id}/preview`, { page: 1 }, b.cookie).expect(404);
   }
   assert.equal((await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } })).storageReservedBytes, 0n);
  });
  const manualZip = await asset('application/zip');
  await t.test('prévia manual exige ZIP pronto e fonte validada na mesma versão/workspace', async () => {
   const before = await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } });
   const path = `/assets/${manualZip.id}/manual-preview`;
   await mutate(path, { previewAssetId: first.id }, b.cookie).expect(404);
   await request(http).post('/api/v1' + path).set('Cookie', a.cookie).send({ previewAssetId: first.id }).expect(403);
   await mutate(path, { previewAssetId: 'invalid' }, a.cookie).expect(400);
   await mutate(path, { previewAssetId: first.id, workspaceId: b.workspaceId }, a.cookie).expect(400);
   await mutate(`/assets/${first.id}/manual-preview`, { previewAssetId: first.id }, a.cookie).expect(409);
   await mutate(path, { previewAssetId: manualZip.id }, a.cookie).expect(409);
   await db.asset.update({ where: { id: first.id }, data: { status: 'UPLOADING' } });
   await mutate(path, { previewAssetId: first.id }, a.cookie).expect(409);
   await db.asset.update({ where: { id: first.id }, data: { status: 'READY' } });
   const audio = await db.asset.findFirstOrThrow({ where: { workspaceId: a.workspaceId, mime: 'audio/wav', status: 'READY' } });
   await mutate(path, { previewAssetId: audio.id }, a.cookie).expect(409);
   const external = await db.asset.create({ data: { workspaceId: b.workspaceId, versionId: b.versionId, fileName: 'b.pdf', mime: 'application/pdf', sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date() } });
   await mutate(path, { previewAssetId: external.id }, a.cookie).expect(404);
   const otherVersion = await db.projectVersion.create({ data: { workspaceId: a.workspaceId, projectId: a.projectId, number: 2 } });
   const other = await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: otherVersion.id, fileName: 'other.pdf', mime: 'application/pdf', sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date() } });
   await mutate(path, { previewAssetId: other.id }, a.cookie).expect(404);
   const results = await Promise.all([1, 2].map(() => mutate(path, { previewAssetId: first.id }, a.cookie)));
   assert.ok(results.every(r => r.status === 200 && r.body.state === 'READY'));
   assert.equal(await db.manualPreview.count({ where: { assetId: manualZip.id } }), 1);
   await assert.rejects(db.manualPreview.update({ where: { assetId: manualZip.id }, data: { sourceAssetId: external.id } }));
   await assert.rejects(db.manualPreview.update({ where: { assetId: manualZip.id }, data: { sourceAssetId: other.id } }));
   const preview = await mutate(`/assets/${manualZip.id}/preview`, { page: 1 }, a.cookie).expect(200);
   assert.equal(preview.body.kind, 'IMAGE'); assert.equal(preview.body.url, 'https://preview.invalid/derivative.jpg');
   await mutate(`/assets/${manualZip.id}/preview`, { page: 1 }, b.cookie).expect(404);
   const after = await db.workspace.findUniqueOrThrow({ where: { id: a.workspaceId } });
   assert.equal(after.storageUsedBytes, before.storageUsedBytes); assert.equal(after.storageReservedBytes, before.storageReservedBytes);
   // Keep unrelated fixtures out of the global worker queue in the following quota scenario.
   await db.asset.updateMany({ where: { id: { in: [external.id, other.id] } }, data: { status: 'FAILED' } });
  });
  await t.test('substituição/remoção da prévia manual preservam fonte e original; arquivado bloqueia mudanças', async () => {
   const replacement = await db.asset.findFirstOrThrow({ where: { workspaceId: a.workspaceId, versionId: a.versionId, id: { not: first.id }, mime: 'application/pdf', mediaJob: { state: 'READY' } } });
   await mutate(`/assets/${manualZip.id}/manual-preview`, { previewAssetId: replacement.id }, a.cookie).expect(200);
   assert.equal((await db.manualPreview.findUniqueOrThrow({ where: { assetId: manualZip.id } })).sourceAssetId, replacement.id);
   await mutate('/projects/' + a.projectId + '/archive', {}, a.cookie).expect(200);
   await mutate(`/assets/${manualZip.id}/manual-preview`, { previewAssetId: first.id }, a.cookie).expect(409);
   await mutate(`/assets/${manualZip.id}/preview`, { page: 1 }, a.cookie).expect(409);
   await db.project.update({ where: { id: a.projectId }, data: { status: 'ACTIVE' } });
   for (let i = 0; i < 2; i++) {
    const result = await request(http).delete(`/api/v1/assets/${manualZip.id}/manual-preview`).set('Origin', 'http://localhost:8080').set('X-CSRF-Token', csrf.body.csrfToken)
     .set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], a.cookie]).send({}).expect(200);
    assert.equal(result.body.state, 'UNSUPPORTED');
   }
   await mutate(`/assets/${manualZip.id}/preview`, { page: 1 }, a.cookie).expect(409);
   assert.equal((await db.asset.findUniqueOrThrow({ where: { id: replacement.id } })).status, 'READY');
   assert.equal((await db.asset.findUniqueOrThrow({ where: { id: manualZip.id } })).objectKey, manualZip.objectKey);
  });
  await t.test('falha de processamento da fonte aparece no ZIP e retry é encaminhado à fonte', async () => {
   const source = await asset();
   await db.mediaJob.create({ data: { assetId: source.id, state: 'FAILED', attempts: 3, failureCode: 'PREVIEW_PROCESSING_FAILED' } });
   const result = await mutate(`/assets/${manualZip.id}/manual-preview`, { previewAssetId: source.id }, a.cookie).expect(200);
   assert.equal(result.body.state, 'FAILED');
   await mutate(`/assets/${manualZip.id}/preview`, { page: 1 }, a.cookie).expect(409);
   await mutate(`/assets/${manualZip.id}/preview-retry`, {}, a.cookie).expect(200);
   assert.equal((await db.mediaJob.findUniqueOrThrow({ where: { assetId: source.id } })).state, 'PENDING');
   await mutate(`/assets/${manualZip.id}/manual-preview`, { previewAssetId: first.id }, a.cookie).expect(200);
   await db.asset.update({ where: { id: source.id }, data: { status: 'FAILED' } });
  });
  let scanResult: 'CLEAN' | 'REJECTED' | 'ERROR' = 'CLEAN'; let scanCalls = 0;
  const scanner: Scanner = { scan: async () => { scanCalls++; return { state: scanResult, definitions: '28152' }; } };
  const security = new SecurityWorker(db, store, scanner);
  async function pendingAsset() {
   const next = await asset();
   return db.asset.update({ where: { id: next.id }, data: { scanStatus: 'PENDING', scannedAt: null, scanSha256: null } });
  }
  await t.test('análise pendente bloqueia parser, prévia e original; CLEAN libera sem duplicar análise', async () => {
   const next = await pendingAsset();
   await db.mediaJob.create({ data: { assetId: next.id, createdAt: new Date(0) } });
   await mutate(`/assets/${next.id}/download`, {}, a.cookie).expect(409);
   await mutate(`/assets/${next.id}/preview`, { page: 1 }, a.cookie).expect(409);
   assert.equal(await worker.tick(), false);
   const calls = scanCalls;
   await Promise.all([security.tick(), security.tick()]);
   assert.equal(scanCalls, calls + 1);
   const clean = await db.asset.findUniqueOrThrow({ where: { id: next.id } });
   assert.equal(clean.scanStatus, 'CLEAN'); assert.equal(clean.scanSha256, createHash('sha256').update('source').digest('hex'));
   await worker.tick();
   await mutate(`/assets/${next.id}/download`, {}, a.cookie).expect(200);
   await mutate(`/assets/${next.id}/preview`, { page: 1 }, a.cookie).expect(200);
  });
  await t.test('arquivo rejeitado permanece privado e não possui override/retry de liberação', async () => {
   const next = await pendingAsset(); scanResult = 'REJECTED';
   await security.tick();
   assert.equal((await db.asset.findUniqueOrThrow({ where: { id: next.id } })).scanStatus, 'REJECTED');
   await mutate(`/assets/${next.id}/download`, {}, a.cookie).expect(409);
   await mutate(`/assets/${next.id}/preview`, { page: 1 }, a.cookie).expect(409);
   await mutate(`/assets/${next.id}/scan-retry`, {}, a.cookie).expect(409);
   assert.equal((await db.asset.findUniqueOrThrow({ where: { id: next.id } })).status, 'READY');
  });
  await t.test('erro tem retry limitado, recupera por ação explícita e análise expirada não libera URL', async () => {
   const next = await pendingAsset(); scanResult = 'ERROR';
   for (let i = 0; i < 3; i++) {
    await security.tick();
    await db.asset.update({ where: { id: next.id }, data: { scanRetryAt: new Date(0) } });
   }
   const calls = scanCalls; assert.equal(await security.tick(), false); assert.equal(scanCalls, calls);
   await mutate(`/assets/${next.id}/scan-retry`, {}, b.cookie).expect(404);
   await mutate(`/assets/${next.id}/scan-retry`, {}, a.cookie).expect(200);
   scanResult = 'CLEAN'; await security.tick();
   await mutate(`/assets/${next.id}/download`, {}, a.cookie).expect(200);
   await db.asset.update({ where: { id: next.id }, data: { scannedAt: new Date(Date.now() - 86400001) } });
   await mutate(`/assets/${next.id}/download`, {}, a.cookie).expect(409);
   await security.tick();
   await mutate(`/assets/${next.id}/download`, {}, a.cookie).expect(200);
   // This scenario tests scanning, not rendering.
   await db.mediaJob.upsert({ where: { assetId: next.id }, create: { assetId: next.id, state: 'FAILED' }, update: { state: 'FAILED' } });
  });
  await t.test('lease abandonado na última tentativa vira erro recuperável, sem ficar RUNNING para sempre', async () => {
   const next = await pendingAsset();
   await db.asset.update({ where: { id: next.id }, data: { scanStatus: 'RUNNING', scanAttempts: 3, scanLeaseToken: randomUUID(), scanLeaseUntil: new Date(0) } });
   await security.tick();
   const failed = await db.asset.findUniqueOrThrow({ where: { id: next.id } });
   assert.equal(failed.scanStatus, 'ERROR'); assert.equal(failed.scanLeaseToken, null);
  });
  await t.test('conteúdo alterado depois da análise invalida CLEAN antes de executar parser', async () => {
   const next = await asset();
   const job = await db.mediaJob.create({ data: { assetId: next.id, createdAt: new Date(0) } });
   changedSource = true; await worker.tick(); changedSource = false;
   assert.equal((await db.asset.findUniqueOrThrow({ where: { id: next.id } })).scanStatus, 'PENDING');
   await mutate(`/assets/${next.id}/download`, {}, a.cookie).expect(409);
   await db.mediaRun.updateMany({ where: { jobId: job.id }, data: { expiresAt: new Date(0) } });
   await worker.cleanup();
   await db.mediaJob.update({ where: { id: job.id }, data: { state: 'FAILED' } });
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
