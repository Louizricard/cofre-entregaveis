import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import type { ObjectStorage } from '../src/storage.js';
import { digest } from '../src/security.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const target = new URL(databaseUrl);
if (target.port !== '5433' || target.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');

test('compartilhamento: sessão convidada limitada, revogação e prévias privadas', async t => {
 let onPreview: (() => Promise<void>) | undefined;
 const store: ObjectStorage = { create: async () => 'u', signPart: async () => '', parts: async () => [], complete: async () => {},
  head: async () => null, prefix: async () => new Uint8Array(), cleanup: async () => {}, download: async () => 'https://original.invalid',
  preview: async () => { await onPreview?.(); return 'https://preview.invalid/derivative.jpg'; } };
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { storage: store, quiet: true });
 const db = server.db; const http = server.app.getHttpServer();
 const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
 const cookies = (cookie = '') => [...csrf.headers['set-cookie'] as unknown as string[], cookie];
 const mutate = (path: string, body: object, cookie = '') => request(http).post('/api/v1' + path).set('Origin', 'http://localhost:8080')
  .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', cookies(cookie)).send(body);
 const get = (path: string, cookie = '') => request(http).get('/api/v1' + path).set('Cookie', cookie);
 const del = (path: string, cookie: string) => request(http).delete('/api/v1' + path).set('Origin', 'http://localhost:8080')
  .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', cookies(cookie)).send({});
 const expiry = () => new Date(Date.now() + 86400000).toISOString();
 let boots = 0;
 const boot = (token: string, cookie = '') => { boots++; return mutate('/guest/bootstrap', { token }, cookie); };
 const guestCookie = (r: request.Response) => (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-guest='))!.split(';')[0];
 async function account() {
  const r = await mutate('/auth/register', { name: 'QA', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123', workspaceName: 'Sharing QA' }).expect(201);
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
  const client = await mutate('/clients', { name: 'QA', email: 'private@example.com' }, cookie).expect(201);
  const project = await mutate('/projects', { clientId: client.body.id, title: 'Entrega QA', balanceCents: 1200, includedRevisionRounds: 2 }, cookie).expect(201);
  const version = await mutate(`/projects/${project.body.id}/versions`, {}, cookie).expect(201);
  const file = await db.asset.create({ data: { workspaceId: r.body.workspace.id as string, versionId: version.body.id as string, fileName: 'preview.pdf', mime: 'application/pdf',
   sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
  await db.mediaJob.create({ data: { assetId: file.id, state: 'READY', pages: { create: { number: 1, objectKey: randomUUID(), sizeBytes: 5n, width: 100, height: 100 } } } });
  await mutate(`/versions/${version.body.id}/publish`, { expectedProjectRevision: version.body.projectRevision }, cookie).expect(200);
  return { cookie, workspaceId: r.body.workspace.id as string, projectId: project.body.id as string, versionId: version.body.id as string, file, clientId: client.body.id as string };
 }
 try {
  const a = await account(); const b = await account();
  await t.test('criação exige criador, workspace, publicação e validade limitada', async () => {
   await mutate(`/projects/${a.projectId}/shares`, { expiresAt: expiry() }).expect(401);
   await mutate(`/projects/${a.projectId}/shares`, { expiresAt: expiry() }, b.cookie).expect(404);
   await mutate(`/projects/${a.projectId}/shares`, { expiresAt: new Date(Date.now() + 60000).toISOString() }, a.cookie).expect(400);
   await mutate(`/projects/${a.projectId}/shares`, { expiresAt: new Date(Date.now() + 31 * 86400000).toISOString() }, a.cookie).expect(400);
   const draft = await mutate('/projects', { clientId: a.clientId, title: 'Não publicado', balanceCents: 0, includedRevisionRounds: 0 }, a.cookie).expect(201);
   await mutate(`/projects/${draft.body.id}/shares`, { expiresAt: expiry() }, a.cookie).expect(409);
  });
  const link = await mutate(`/projects/${a.projectId}/shares`, { expiresAt: expiry() }, a.cookie).expect(201);
  const token = (link.body.url as string).split('/s/')[1]!;
  const another = await mutate(`/projects/${a.projectId}/shares`, { expiresAt: expiry() }, a.cookie).expect(201);
  const token2 = (another.body.url as string).split('/s/')[1]!;
  await t.test('link mostrado uma vez; somente hashes persistidos, tokens independentes', async () => {
   assert.match(token, /^[A-Za-z0-9_-]{43}$/); assert.notEqual(token, token2);
   const saved = await db.shareLink.findUniqueOrThrow({ where: { id: link.body.id as string } });
   assert.equal(saved.tokenHash, digest(token)); assert.ok(!JSON.stringify(saved).includes(token));
   const listed = await get(`/projects/${a.projectId}/shares`, a.cookie).expect(200);
   assert.equal(listed.body.items.length, 2); assert.ok(!JSON.stringify(listed.body).includes(token)); assert.ok(!JSON.stringify(listed.body).includes('tokenHash'));
  });
  const session = await boot(token).expect(200); const guest = guestCookie(session);
  await t.test('cookie HttpOnly próprio, prazo limitado e nenhuma permissão de criador', async () => {
   const cookie = (session.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-guest='))!;
   assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Lax/); assert.match(cookie, /Path=\//);
   const saved = await db.guestSession.findUniqueOrThrow({ where: { tokenHash: digest(guest.split('=')[1]!) } });
   assert.ok(saved.expiresAt.getTime() <= Date.now() + 8 * 3600000);
   await get('/auth/me', guest).expect(401); await get('/guest/project', a.cookie).expect(401);
   await mutate(`/assets/${a.file.id}/download`, {}, guest).expect(401);
   await mutate(`/projects/${a.projectId}/shares`, { expiresAt: expiry() }, guest).expect(401);
   await mutate('/guest/downloads', { assetId: a.file.id }, guest).expect(404);
  });
  const draft = await mutate(`/projects/${a.projectId}/versions`, {}, a.cookie).expect(201);
  const draftAsset = await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: draft.body.id as string, fileName: 'draft.zip', mime: 'application/zip', sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date() } });
  const sameWorkspaceProject = await mutate('/projects', { clientId: a.clientId, title: 'Outro projeto privado', balanceCents: 0, includedRevisionRounds: 0 }, a.cookie).expect(201);
  const otherVersion = await mutate(`/projects/${sameWorkspaceProject.body.id}/versions`, {}, a.cookie).expect(201);
  const otherFile = await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: otherVersion.body.id as string, fileName: 'other.zip', mime: 'application/zip', sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
  await mutate(`/versions/${otherVersion.body.id}/publish`, { expectedProjectRevision: otherVersion.body.projectRevision }, a.cookie).expect(200);
  await t.test('resumo seguro, paginação e somente arquivos publicados do projeto autorizado', async () => {
   const p = await get('/guest/project', guest).expect(200);
   assert.equal(p.body.currentVersion.id, a.versionId); assert.equal(p.body.balanceCents, 1200);
   const versions = await get('/guest/versions', guest).expect(200); assert.equal(versions.body.items.length, 1);
   const v = await get(`/guest/versions/${a.versionId}`, guest).expect(200); assert.equal(v.body.assets[0].id, a.file.id);
   for (const body of [p.body, versions.body, v.body]) for (const secret of ['objectKey', 'multipartId', 'tokenHash', 'workspaceId', 'private@example.com', a.file.objectKey]) assert.ok(!JSON.stringify(body).includes(secret));
   for (const id of [draft.body.id as string, otherVersion.body.id as string, b.versionId]) await get(`/guest/versions/${id}`, guest).expect(404);
   await get(`/guest/versions?cursor=${b.versionId}`, guest).expect(404);
   for (const id of [draftAsset.id, otherFile.id, b.file.id]) {
    await get(`/guest/assets/${id}/preview-status`, guest).expect(404);
    await mutate(`/guest/assets/${id}/preview`, { page: 1 }, guest).expect(404);
   }
  });
  await t.test('prévia usa derivado, valida página/CSRF e bloqueia análise vencida', async () => {
   await get(`/guest/assets/${a.file.id}/preview-status`, guest).expect(200);
   const preview = await mutate(`/guest/assets/${a.file.id}/preview`, { page: 1 }, guest).expect(200);
   assert.equal(preview.body.url, 'https://preview.invalid/derivative.jpg'); assert.ok(!JSON.stringify(preview.body).includes('original'));
   await mutate(`/guest/assets/${a.file.id}/preview`, { page: 0 }, guest).expect(400);
   await request(http).post(`/api/v1/guest/assets/${a.file.id}/preview`).set('Cookie', guest).send({ page: 1 }).expect(403);
   await db.asset.update({ where: { id: a.file.id }, data: { scannedAt: new Date(0) } });
   const blocked = await get(`/guest/assets/${a.file.id}/preview-status`, guest).expect(200); assert.equal(blocked.body.state, 'PENDING');
   await mutate(`/guest/assets/${a.file.id}/preview`, { page: 1 }, guest).expect(409);
   await db.asset.update({ where: { id: a.file.id }, data: { scannedAt: new Date() } });
  });
  await t.test('nova publicação entra no portal; versão anterior continua consultável', async () => {
   await db.asset.update({ where: { id: draftAsset.id }, data: { scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
   const p = await db.project.findUniqueOrThrow({ where: { id: a.projectId } });
   await mutate(`/versions/${draft.body.id}/publish`, { expectedProjectRevision: p.revision }, a.cookie).expect(200);
   assert.equal((await get('/guest/project', guest).expect(200)).body.currentVersion.id, draft.body.id);
   const first = await get('/guest/versions?limit=1', guest).expect(200); assert.ok(first.body.nextCursor);
   const second = await get('/guest/versions?limit=1&cursor=' + first.body.nextCursor, guest).expect(200); assert.equal(second.body.items[0].state, 'SUPERSEDED');
   await get(`/guest/versions/${a.versionId}`, guest).expect(200);
  });
  await t.test('revogação é isolada, idempotente e invalida sessão e bootstrap', async () => {
   await del(`/shares/${link.body.id}`, b.cookie).expect(404);
   await del(`/shares/${link.body.id}`, a.cookie).expect(204); await del(`/shares/${link.body.id}`, a.cookie).expect(204);
   await get('/guest/project', guest).expect(401); await get('/guest/versions', guest).expect(401);
   await mutate(`/guest/assets/${a.file.id}/preview`, { page: 1 }, guest).expect(401);
   await boot(token).expect(401);
  });
  const second = await boot(token2).expect(200); const guest2 = guestCookie(second);
  await t.test('rotação de cookie revoga sessão antiga e mantém novo acesso limitado', async () => {
   const rotated = await boot(token2, guest2).expect(200);
   await get('/guest/project', guest2).expect(401);
   await get('/guest/project', guestCookie(rotated)).expect(200);
   await mutate('/guest/logout', {}, guestCookie(rotated)).expect(204);
   await get('/guest/project', guestCookie(rotated)).expect(401);
  });
  const session3 = await boot(token2).expect(200); const guest3 = guestCookie(session3);
  await t.test('sessão expirada bloqueia acesso', async () => {
   await db.guestSession.updateMany({ where: { tokenHash: digest(guest3.split('=')[1]!) }, data: { createdAt: new Date(0), expiresAt: new Date(1) } });
   await get('/guest/project', guest3).expect(401);
  });
  const session4 = await boot(token2).expect(200); const guest4 = guestCookie(session4);
  await t.test('revogação durante assinatura impede retorno da URL', async () => {
   onPreview = async () => { await db.shareLink.update({ where: { id: another.body.id as string }, data: { revokedAt: new Date() } }); };
   await mutate(`/guest/assets/${a.file.id}/preview`, { page: 1 }, guest4).expect(401); onPreview = undefined;
  });
  const third = await mutate(`/projects/${a.projectId}/shares`, { expiresAt: expiry() }, a.cookie).expect(201);
  const token3 = (third.body.url as string).split('/s/')[1]!;
  const session5 = await boot(token3).expect(200); const guest5 = guestCookie(session5);
  await t.test('expiração do link bloqueia sessões já emitidas', async () => {
   await db.shareLink.update({ where: { id: third.body.id as string }, data: { createdAt: new Date(0), expiresAt: new Date(1) } });
   await get('/guest/project', guest5).expect(401); await boot(token3).expect(401);
  });
  const fourth = await mutate(`/projects/${a.projectId}/shares`, { expiresAt: expiry() }, a.cookie).expect(201);
  const token4 = (fourth.body.url as string).split('/s/')[1]!;
  const session6 = await boot(token4).expect(200); const guest6 = guestCookie(session6);
  await t.test('arquivamento bloqueia portal e novo bootstrap', async () => {
   await mutate(`/projects/${a.projectId}/archive`, {}, a.cookie).expect(200);
   await get('/guest/project', guest6).expect(401); await boot(token4).expect(401);
  });
  await t.test('limite de dez links ativos permanece correto com criação concorrente', async () => {
   for (let i = 0; i < 9; i++) await mutate(`/projects/${b.projectId}/shares`, { expiresAt: expiry() }, b.cookie).expect(201);
   const results = await Promise.all([1, 2].map(() => mutate(`/projects/${b.projectId}/shares`, { expiresAt: expiry() }, b.cookie)));
   assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
   assert.equal(await db.shareLink.count({ where: { projectId: b.projectId, revokedAt: null } }), 10);
  });
  await t.test('bootstrap tem rate limit sem expor token nos erros', async () => {
   while (boots < 10) await boot('A'.repeat(43)).expect(401);
   const limited = await boot('A'.repeat(43)).expect(429);
   assert.ok(!JSON.stringify(limited.body).includes('A'.repeat(43)));
  });
 } finally { await server.close(); }
});
