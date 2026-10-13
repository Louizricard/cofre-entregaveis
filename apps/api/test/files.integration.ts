import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { FilesService } from '../src/files.service.js';
import { type ObjectStorage, type StoredPart } from '../src/storage.js';
import { PART_SIZE, QUOTA_MAX } from '../src/file-types.js';

class FakeStorage implements ObjectStorage {
 uploads = new Map<string, { key: string; mime: string; assetId: string; parts: StoredPart[]; bytes: Buffer }>();
 objects = new Map<string, { size: number; mime: string; assetId: string; bytes: Buffer }>();
 failCleanup = false;
 loseCompleteResponse = false;
 completeCalls = 0;
 async create(key: string, mime: string, assetId: string) {
  const id = randomUUID(); this.uploads.set(id, { key, mime, assetId, parts: [], bytes: Buffer.alloc(0) }); return id;
 }
 async signPart(_key: string, _id: string, n: number, size: number) { return `https://storage.invalid/part/${n}?size=${size}`; }
 async parts(_key: string, id: string) { return this.uploads.get(id)!.parts; }
 async complete(key: string, id: string) {
  const u = this.uploads.get(id)!; this.completeCalls++;
  this.objects.set(key, { size: u.parts.reduce((n, p) => n + p.size, 0), mime: u.mime, assetId: u.assetId, bytes: u.bytes });
  this.uploads.delete(id);
  if (this.loseCompleteResponse) { this.loseCompleteResponse = false; throw new Error('Response lost'); }
 }
 async head(key: string) { return this.objects.get(key) ?? null; }
 async prefix(key: string) { return this.objects.get(key)!.bytes; }
 async cleanup(key: string, id: string | null) {
  if (this.failCleanup) throw new Error('Network down');
  if (id) this.uploads.delete(id);
  for (const [id, u] of this.uploads) if (u.key === key) this.uploads.delete(id);
  this.objects.delete(key);
 }
 async download() { return 'https://storage.invalid/download'; }
}
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const target = new URL(databaseUrl);
if (target.port !== '5433' || target.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');

test('arquivos privados: transações PostgreSQL e adapter de armazenamento simulado', async t => {
 const origin = 'http://localhost:8080'; const storage = new FakeStorage();
 const server = await createApp({ databaseUrl, origin, production: false, sessionDays: 7, port: 3000 }, { storage, quiet: true });
 const http = server.app.getHttpServer(); const files = server.app.get(FilesService);
 const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
 async function mutate(path: string, body: object, cookie: string, del = false) {
  const r = del ? request(http).delete('/api/v1' + path) : request(http).post('/api/v1' + path);
  return r.set('Origin', origin).set('X-CSRF-Token', csrf.body.csrfToken)
   .set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], ...(cookie ? [cookie] : [])]).send(body);
 }
 async function setup() {
  const registered = await mutate('/auth/register', { name: 'QA', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123', workspaceName: 'QA arquivos' }, '');
  assert.equal(registered.status, 201);
  const cookie = (registered.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
  const client = await mutate('/clients', { name: 'Cliente', email: 'cliente@example.com' }, cookie);
  const project = await mutate('/projects', { clientId: client.body.id, title: 'Arquivos', balanceCents: 0, includedRevisionRounds: 0 }, cookie);
  assert.equal(project.status, 201);
  return { cookie, workspaceId: registered.body.workspace.id as string, projectId: project.body.id as string };
 }
 const pdf = Buffer.from('%PDF-1.7\n');
 async function start(versionId: string, cookie: string, size = pdf.length) {
  return mutate('/versions/' + versionId + '/uploads', { fileName: 'arquivo.pdf', declaredMime: 'application/pdf', sizeBytes: size.toString() }, cookie);
 }
 async function put(id: string, bytes = pdf, declaredParts?: StoredPart[]) {
  const a = await server.db.asset.findUniqueOrThrow({ where: { id } });
  const upload = storage.uploads.get(a.multipartId!)!;
  upload.parts = declaredParts ?? [{ partNumber: 1, etag: '"part-1"', size: bytes.length }]; upload.bytes = bytes;
  return { parts: upload.parts.map(p => ({ partNumber: p.partNumber, etag: p.etag })) };
 }
 try {
  const a = await setup(); const b = await setup();
  let versionId = ''; let readyId = '';
  await t.test('numeração concorrente, paginação e isolamento de versões', async () => {
   const results = await Promise.all([1, 2].map(() => mutate('/projects/' + a.projectId + '/versions', {}, a.cookie)));
   assert.ok(results.every(r => r.status === 201));
   assert.deepEqual(results.map(r => r.body.number).sort(), [1, 2]); versionId = results.find(r => r.body.number === 1)!.body.id;
   const page = await request(http).get('/api/v1/projects/' + a.projectId + '/versions?limit=1').set('Cookie', a.cookie).expect(200);
   assert.equal(page.body.items.length, 1); assert.ok(page.body.nextCursor);
   const next = await request(http).get('/api/v1/projects/' + a.projectId + '/versions?cursor=' + page.body.nextCursor).set('Cookie', a.cookie).expect(200);
   assert.equal(next.body.items[0].number, 2); assert.equal(next.body.nextCursor, null);
   await request(http).get('/api/v1/projects/' + a.projectId + '/versions').set('Cookie', b.cookie).expect(404);
   assert.equal((await mutate('/projects/' + a.projectId + '/versions', {}, b.cookie)).status, 404);
  });
  await t.test('valida tamanho/formato, sessão, CSRF e workspace antes de reservar cota', async () => {
   for (const bad of [{ sizeBytes: '0' }, { sizeBytes: '-1' }, { sizeBytes: '2147483649' }, { sizeBytes: 9 }, { fileName: '../a.pdf' },
    { fileName: 'arquivo.html' }, { declaredMime: 'text/html' }, { workspaceId: b.workspaceId }]) {
    assert.equal((await mutate('/versions/' + versionId + '/uploads', { fileName: 'a.pdf', declaredMime: 'application/pdf', sizeBytes: '9', ...bad }, a.cookie)).status, 400);
   }
   assert.equal((await start(versionId, b.cookie)).status, 404);
   assert.equal((await start(versionId, '')).status, 401);
   await request(http).post('/api/v1/versions/' + versionId + '/uploads').set('Cookie', a.cookie).send({}).expect(403);
   assert.equal((await files.capabilities(a.workspaceId)).reservedBytes, '0');
  });
  await t.test('objeto parcial não pode ser baixado; READY exige tamanho, metadados e partes reais', async () => {
   const r = await start(versionId, a.cookie); assert.equal(r.status, 201); readyId = r.body.asset.id;
   assert.equal(r.body.partSizeBytes, PART_SIZE); assert.equal(r.body.partCount, 1);
   assert.equal(r.body.asset.objectKey, undefined); assert.equal(r.body.asset.multipartId, undefined);
   assert.equal((await files.capabilities(a.workspaceId)).reservedBytes, pdf.length.toString());
   assert.equal((await mutate('/assets/' + readyId + '/download', {}, a.cookie)).status, 409);
   assert.equal((await mutate('/projects/' + a.projectId + '/archive', {}, a.cookie)).status, 409);
   assert.equal((await mutate('/uploads/' + readyId + '/parts', { partNumbers: [2] }, a.cookie)).status, 400);
   assert.equal((await mutate('/uploads/' + readyId + '/parts', { partNumbers: [1, 1] }, a.cookie)).status, 400);
   const signed = await mutate('/uploads/' + readyId + '/parts', { partNumbers: [1] }, a.cookie);
   assert.equal(signed.status, 200); assert.match(signed.body.parts[0].url, /size=9/);
   const body = await put(readyId);
   assert.equal((await mutate('/uploads/' + readyId + '/complete', { parts: [{ partNumber: 1, etag: 'forged' }] }, a.cookie)).status, 400);
   const done = await mutate('/uploads/' + readyId + '/complete', body, a.cookie); assert.equal(done.status, 200); assert.equal(done.body.status, 'READY');
   assert.equal((await mutate('/uploads/' + readyId + '/complete', body, a.cookie)).status, 200);
   assert.equal((await mutate('/uploads/' + readyId + '/complete', { parts: [{ partNumber: 1, etag: 'changed' }] }, a.cookie)).status, 409);
   const quota = await files.capabilities(a.workspaceId); assert.equal(quota.usedBytes, '9'); assert.equal(quota.reservedBytes, '0'); assert.equal(quota.activeUploads, 0);
   assert.equal(done.body.scanStatus, 'PENDING');
   assert.equal((await mutate('/assets/' + readyId + '/download', {}, a.cookie)).status, 409);
   await server.db.asset.update({ where: { id: readyId }, data: { scanStatus: 'CLEAN', scannedAt: new Date(), scanSha256: 'a'.repeat(64), scanDefinitions: 'test' } });
   assert.equal((await mutate('/assets/' + readyId + '/download', {}, a.cookie)).status, 200);
   for (const path of ['/uploads/' + readyId + '/parts', '/uploads/' + readyId + '/complete', '/assets/' + readyId + '/download']) {
    const result = await mutate(path, path.endsWith('/parts') ? { partNumbers: [1] } : path.endsWith('/complete') ? body : {}, b.cookie);
    assert.equal(result.status, 404);
   }
   await request(http).get('/api/v1/uploads/' + readyId).set('Cookie', b.cookie).expect(404);
   assert.equal((await mutate('/uploads/' + readyId, {}, b.cookie, true)).status, 404);
  });
  await t.test('conclusão com resposta perdida recupera por HEAD sem duplicar uso de cota', async () => {
   const r = await start(versionId, a.cookie); const id = r.body.asset.id; const body = await put(id);
   storage.loseCompleteResponse = true; const calls = storage.completeCalls;
   assert.equal((await mutate('/uploads/' + id + '/complete', body, a.cookie)).status, 503);
   assert.equal((await files.asset(a.workspaceId, id)).status, 'COMPLETING');
   assert.equal((await mutate('/uploads/' + id + '/complete', body, a.cookie)).status, 200);
   assert.equal(storage.completeCalls, calls + 1);
   assert.equal((await files.capabilities(a.workspaceId)).usedBytes, '18');
  });
  await t.test('assinatura falsa é rejeitada e limpeza libera reserva', async () => {
   const r = await start(versionId, a.cookie); const id = r.body.asset.id;
   const body = await put(id, Buffer.from('HTML fake'));
   assert.equal((await mutate('/uploads/' + id + '/complete', body, a.cookie)).status, 400);
   assert.equal((await files.asset(a.workspaceId, id)).status, 'FAILED');
   assert.equal((await files.capabilities(a.workspaceId)).reservedBytes, '0');
   assert.equal((await mutate('/assets/' + id + '/download', {}, a.cookie)).status, 409);
  });
  await t.test('abort com falha mantém fila/reserva e worker retoma sem dupla liberação', async () => {
   const r = await start(versionId, a.cookie); const id = r.body.asset.id;
   storage.failCleanup = true;
   const abort = await mutate('/uploads/' + id, {}, a.cookie, true); assert.equal(abort.status, 200); assert.equal(abort.body.status, 'ABORTING');
   assert.equal((await files.capabilities(a.workspaceId)).reservedBytes, '9');
   storage.failCleanup = false;
   await server.db.asset.update({ where: { id }, data: { retryAt: new Date(0) } });
   await files.sweep();
   assert.equal((await files.asset(a.workspaceId, id)).status, 'ABORTED');
   assert.equal((await mutate('/uploads/' + id, {}, a.cookie, true)).status, 200);
   assert.equal((await files.capabilities(a.workspaceId)).reservedBytes, '0');
  });
  await t.test('cinco uploads e cota concorrente são limites transacionais', async () => {
   const c = await setup(); const v = await mutate('/projects/' + c.projectId + '/versions', {}, c.cookie);
   const starts = await Promise.all(Array.from({ length: 6 }, () => start(v.body.id, c.cookie)));
   assert.equal(starts.filter(r => r.status === 201).length, 5); assert.equal(starts.filter(r => r.status === 409).length, 1);
   assert.equal((await files.capabilities(c.workspaceId)).activeUploads, 5);
   for (const r of starts.filter(r => r.status === 201)) await mutate('/uploads/' + r.body.asset.id, {}, c.cookie, true);
   await server.db.workspace.update({ where: { id: c.workspaceId }, data: { storageUsedBytes: QUOTA_MAX - 9n } });
   const concurrent = await Promise.all([start(v.body.id, c.cookie), start(v.body.id, c.cookie)]);
   assert.deepEqual(concurrent.map(r => r.status).sort(), [201, 409]);
  });
  await t.test('uploads vencidos expiram, lease impede concorrência e arquivo arquivado não é liberado', async () => {
   const r = await start(versionId, a.cookie); const id = r.body.asset.id;
   await server.db.asset.update({ where: { id }, data: { leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 60000) } });
   assert.equal((await mutate('/uploads/' + id, {}, a.cookie, true)).status, 409);
   await server.db.asset.update({ where: { id }, data: { leaseToken: null, leaseUntil: null, expiresAt: new Date(0) } });
   await files.sweep(); assert.equal((await files.asset(a.workspaceId, id)).status, 'FAILED');
   assert.equal((await files.capabilities(a.workspaceId)).activeUploads, 0);
   assert.equal((await mutate('/projects/' + a.projectId + '/archive', {}, a.cookie)).status, 200);
   assert.equal((await mutate('/assets/' + readyId + '/download', {}, a.cookie)).status, 409);
   assert.equal((await start(versionId, a.cookie)).status, 409);
   assert.equal((await mutate('/projects/' + a.projectId + '/versions', {}, a.cookie)).status, 409);
  });
 } finally { await server.close(); }
});
