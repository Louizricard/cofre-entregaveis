import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { ObjectStorage } from '../src/storage.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const target = new URL(databaseUrl);
if (target.port !== '5433' || target.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');

test('publicação: imutabilidade, concorrência e histórico', async t => {
 const store: ObjectStorage = { create: async () => 'u', signPart: async () => '', parts: async () => [], complete: async () => {},
  head: async () => null, prefix: async () => new Uint8Array(), cleanup: async () => {}, download: async () => 'https://original.invalid' };
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { storage: store, quiet: true });
 const db = server.db; const http = server.app.getHttpServer();
 const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
 const mutate = (path: string, body: object, cookie = '') => request(http).post('/api/v1' + path).set('Origin', 'http://localhost:8080')
  .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], cookie]).send(body);
 async function account() {
  const r = await mutate('/auth/register', { name: 'QA', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123', workspaceName: 'Publicação QA' }).expect(201);
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
  const client = await mutate('/clients', { name: 'QA', email: 'qa@example.com' }, cookie).expect(201);
  const project = await mutate('/projects', { clientId: client.body.id, title: 'Publicação QA', balanceCents: 0, includedRevisionRounds: 2 }, cookie).expect(201);
  const version = await mutate(`/projects/${project.body.id}/versions`, {}, cookie).expect(201);
  return { cookie, workspaceId: r.body.workspace.id as string, projectId: project.body.id as string, versionId: version.body.id as string };
 }
 try {
  const a = await account(); const b = await account();
  const revision = async () => (await db.project.findUniqueOrThrow({ where: { id: a.projectId } })).revision;
  const publish = async (id = a.versionId) => mutate(`/versions/${id}/publish`, { expectedProjectRevision: await revision() }, a.cookie);
  await t.test('autorização, CSRF, DTO e versão vazia', async () => {
   await mutate(`/versions/${a.versionId}/publish`, { expectedProjectRevision: 1 }, b.cookie).expect(404);
   await request(http).post(`/api/v1/versions/${a.versionId}/publish`).set('Cookie', a.cookie).send({ expectedProjectRevision: 1 }).expect(403);
   await mutate(`/versions/${a.versionId}/publish`, { expectedProjectRevision: -1 }, a.cookie).expect(400);
   const empty = await publish(); assert.equal(empty.status, 409); assert.equal(empty.body.error.code, 'VERSION_EMPTY');
  });
  const asset = await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: a.versionId, fileName: 'test.zip', mime: 'application/zip',
   sizeBytes: 10n, objectKey: randomUUID(), status: 'UPLOADING', expiresAt: new Date(Date.now() + 86400000) } });
  await t.test('envio pendente, análise pendente/rejeitada/vencida e prévia incompleta bloqueiam', async () => {
   assert.equal((await publish()).body.error.code, 'UPLOAD_PENDING');
   await db.asset.update({ where: { id: asset.id }, data: { status: 'READY' } });
   assert.equal((await publish()).body.error.code, 'SECURITY_SCAN_REQUIRED');
   await db.asset.update({ where: { id: asset.id }, data: { scanStatus: 'REJECTED' } });
   assert.equal((await publish()).status, 409);
   await db.asset.update({ where: { id: asset.id }, data: { scanStatus: 'CLEAN', scannedAt: new Date(0), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
   assert.equal((await publish()).status, 409);
   await db.asset.update({ where: { id: asset.id }, data: { scannedAt: new Date(), mime: 'application/pdf' } });
   assert.equal((await publish()).body.error.code, 'PREVIEW_NOT_READY');
   await db.asset.update({ where: { id: asset.id }, data: { mime: 'application/zip' } });
  });
  await t.test('revisão desatualizada não publica', async () => {
   const r = await mutate(`/versions/${a.versionId}/publish`, { expectedProjectRevision: 0 }, a.cookie).expect(409);
   assert.equal(r.body.error.code, 'PROJECT_CHANGED');
  });
  await t.test('publicação concorrente aceita uma vez e registra autor/horário', async () => {
   const expectedProjectRevision = await revision();
   const results = await Promise.all([1, 2].map(() => mutate(`/versions/${a.versionId}/publish`, { expectedProjectRevision }, a.cookie)));
   assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
   const v = await db.projectVersion.findUniqueOrThrow({ where: { id: a.versionId } });
   assert.equal(v.state, 'PUBLISHED'); assert.ok(v.publishedAt); assert.ok(v.publishedById);
   assert.equal(await revision(), expectedProjectRevision + 1);
  });
  await t.test('publicada recusa novos arquivos, vínculo e remoção de prévia manual', async () => {
   await mutate(`/versions/${a.versionId}/uploads`, { fileName: 'next.zip', declaredMime: 'application/zip', sizeBytes: '10' }, a.cookie).expect(409);
   await mutate(`/assets/${asset.id}/manual-preview`, { previewAssetId: asset.id }, a.cookie).expect(409);
   await request(http).delete(`/api/v1/assets/${asset.id}/manual-preview`).set('Origin', 'http://localhost:8080')
    .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], a.cookie]).send({}).expect(409);
   const listed = await request(http).get(`/api/v1/projects/${a.projectId}/versions`).set('Cookie', a.cookie).expect(200);
   assert.equal(listed.body.items[0].state, 'PUBLISHED');
  });
  const v2 = await mutate(`/projects/${a.projectId}/versions`, {}, a.cookie).expect(201);
  const v3 = await mutate(`/projects/${a.projectId}/versions`, {}, a.cookie).expect(201);
  for (const versionId of [v2.body.id as string, v3.body.id as string]) await db.asset.create({ data: { workspaceId: a.workspaceId, versionId,
   fileName: 'next.zip', mime: 'application/zip', sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(),
   scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
  await t.test('nova publicação preserva histórico e não permite voltar para rascunho antigo', async () => {
   assert.equal((await publish(v3.body.id as string)).status, 200);
   assert.equal((await db.projectVersion.findUniqueOrThrow({ where: { id: a.versionId } })).state, 'SUPERSEDED');
   assert.equal((await publish(v2.body.id as string)).body.error.code, 'VERSION_OUTDATED');
   assert.equal(await db.projectVersion.count({ where: { projectId: a.projectId, state: 'PUBLISHED' } }), 1);
   assert.equal(await db.asset.count({ where: { versionId: a.versionId } }), 1);
  });
  await t.test('projeto arquivado bloqueia publicação', async () => {
   await mutate(`/projects/${a.projectId}/archive`, {}, a.cookie).expect(200);
   assert.equal((await publish(v2.body.id as string)).body.error.code, 'PROJECT_ARCHIVED');
  });
 } finally { await server.close(); }
});
