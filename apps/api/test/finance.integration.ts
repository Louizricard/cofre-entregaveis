import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { FinanceService } from '../src/finance.service.js';
import { digest, newToken } from '../src/security.js';
import type { GuestRequest } from '../src/sharing.service.js';
import type { ObjectStorage } from '../src/storage.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const url = new URL(databaseUrl);
if (url.port !== '5433' || url.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(url.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');

test('quitação manual auditada e originais condicionados', async t => {
 const signed: string[] = []; let failSigning = false;
 const storage = { download: async (key: string) => { if (failSigning) throw new Error('private storage failure'); signed.push(key); return 'https://storage.invalid/original'; } } as unknown as ObjectStorage;
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { quiet: true, storage });
 t.after(() => server.close());
 const { db } = server; const http = server.app.getHttpServer(); const service = server.app.get(FinanceService);
 const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
 const mutate = (path: string, body: object, cookie = '', key: string = randomUUID()) => request(http).post('/api/v1' + path).set('Origin', 'http://localhost:8080')
  .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], cookie]).set('Idempotency-Key', key).send(body);
 async function account(amount: number) {
  const r = await mutate('/auth/register', { name: 'Criador QA', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123', workspaceName: 'Finance QA' }).expect(201);
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
  const c = await mutate('/clients', { name: 'Cliente QA', email: 'client@example.com' }, cookie).expect(201);
  const p = await mutate('/projects', { clientId: c.body.id, title: 'QA', balanceCents: amount, includedRevisionRounds: 1 }, cookie).expect(201);
  const workspaceId = r.body.workspace.id as string; const projectId = p.body.id as string;
  const v = await db.projectVersion.create({ data: { workspaceId, projectId, number: 1, state: 'PUBLISHED', publishedAt: new Date(), publishedById: r.body.user.id as string } });
  const asset = await db.asset.create({ data: { workspaceId, versionId: v.id, fileName: 'qa.zip', mime: 'application/zip', sizeBytes: 1n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
  const share = await db.shareLink.create({ data: { workspaceId, projectId, tokenHash: digest(newToken()), expiresAt: new Date(Date.now() + 86400000) } });
  const token = newToken(); const session = await db.guestSession.create({ data: { shareId: share.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000), verifiedAt: new Date(), verifiedEmail: 'client@example.com' } });
  return { workspaceId, projectId, cookie, userId: r.body.user.id as string, asset, version: v, share, session, guestCookie: 'cofre-guest=' + token, req: { cookies: { 'cofre-guest': token } } as unknown as GuestRequest };
 }
 const a = await account(12500); const b = await account(100); const zero = await account(0);
 const invoice = () => db.invoice.findFirstOrThrow({ where: { projectId: a.projectId }, orderBy: { number: 'desc' } });
 const input = async (kind: 'EXTERNAL_PAYMENT' | 'WAIVER' | 'REVERSAL' = 'EXTERNAL_PAYMENT') => { const i = await invoice(); return { invoiceId: i.id, expectedRevision: i.revision, kind, reason: 'Recebimento confirmado no teste', confirmed: true }; };
 const path = '/projects/' + a.projectId + '/manual-settlement';
 const rejectDownload = () => assert.rejects(service.download(a.req, a.asset.id));
 {
  await t.test('projetos recebem cobrança OPEN inclusive valor zero, com isolamento', async () => {
   assert.equal((await invoice()).amountCents, 12500);
   const view = await request(http).get('/api/v1/projects/' + a.projectId + '/finance').set('Cookie', a.cookie).expect(200);
   assert.equal(view.body.invoice.state, 'OPEN'); assert.deepEqual(view.body.history, []);
   await request(http).get('/api/v1/projects/' + a.projectId + '/finance').set('Cookie', b.cookie).expect(404);
   await mutate(path, { ...await input(), invoiceId: (await db.invoice.findFirstOrThrow({ where: { projectId: b.projectId } })).id }, a.cookie).expect(404);
  });
  await t.test('sessão, CSRF, confirmação, motivo e chave são exigidos; membro não quita', async () => {
   await mutate(path, await input()).expect(401);
   await request(http).post('/api/v1' + path).set('Cookie', a.cookie).send(await input()).expect(403);
   await mutate(path, await input(), a.cookie, 'invalid').expect(400);
   await mutate(path, { ...await input(), confirmed: false }, a.cookie).expect(400);
   await mutate(path, { ...await input(), reason: '   ' }, a.cookie).expect(400);
   await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: a.workspaceId, userId: a.userId } }, data: { role: 'MEMBER' } });
   await mutate(path, await input(), a.cookie).expect(403);
   await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId: a.workspaceId, userId: a.userId } }, data: { role: 'OWNER' } });
   assert.equal(await db.manualSettlement.count(), 0);
  });
  await t.test('aprovação e quitação são independentes; pagamento não substitui aprovação', async () => {
   await rejectDownload(); assert.equal(signed.length, 0);
   const i = await input(); const key = randomUUID();
   const first = await mutate(path, i, a.cookie, key).expect(200);
   assert.equal(first.body.invoice.state, 'PAID'); assert.equal(first.body.history[0].actorName, 'Criador QA');
   assert.equal((await db.project.findUniqueOrThrow({ where: { id: a.projectId } })).balanceCents, 0);
   await rejectDownload(); assert.equal(signed.length, 0);
   await mutate(path, i, a.cookie, key).expect(200); assert.equal(await db.manualSettlement.count(), 1);
   await mutate(path, { ...i, reason: 'Motivo diferente' }, a.cookie, key).expect(409);
   await mutate(path, i, a.cookie).expect(409);
   await db.approval.create({ data: { workspaceId: a.workspaceId, versionId: a.version.id, guestSessionId: a.session.id, authorEmail: 'client@example.com' } });
   const result = await mutate('/guest/assets/' + a.asset.id + '/download', {}, a.guestCookie).expect(200);
   assert.equal(result.body.url, 'https://storage.invalid/original'); assert.equal(await db.originalGrant.count(), 1);
   assert.ok(Date.parse(result.body.expiresAt) <= Date.now() + 61000); assert.deepEqual(signed, [a.asset.objectKey]);
   await db.project.update({ where: { id: a.projectId }, data: { balanceCents: 100 } });
   await rejectDownload(); await mutate(path, await input('REVERSAL'), a.cookie).expect(409);
   await db.project.update({ where: { id: a.projectId }, data: { balanceCents: 0 } });
  });
  await t.test('identidade, segurança vigente, sessão/link revogados e arquivo alheio bloqueiam assinatura', async () => {
   const before = signed.length;
   await assert.rejects(service.download(a.req, b.asset.id));
   await db.guestSession.update({ where: { id: a.session.id }, data: { verifiedEmail: 'changed@example.com' } }); await rejectDownload();
   await db.guestSession.update({ where: { id: a.session.id }, data: { verifiedEmail: 'client@example.com' } });
   await db.asset.update({ where: { id: a.asset.id }, data: { scannedAt: new Date(Date.now() - 86400001) } }); await rejectDownload();
   await db.asset.update({ where: { id: a.asset.id }, data: { scannedAt: new Date(), scanStatus: 'REJECTED' } }); await rejectDownload();
   await db.asset.update({ where: { id: a.asset.id }, data: { scanStatus: 'CLEAN' } });
   await db.shareLink.update({ where: { id: a.share.id }, data: { revokedAt: new Date() } }); await rejectDownload();
   await db.shareLink.update({ where: { id: a.share.id }, data: { revokedAt: null } });
   await db.guestSession.update({ where: { id: a.session.id }, data: { revokedAt: new Date() } }); await rejectDownload();
   await db.guestSession.update({ where: { id: a.session.id }, data: { revokedAt: null } });
   assert.equal(signed.length, before);
  });
  await t.test('reversão restaura saldo e replay de pagamento antigo não restaura quitação', async () => {
   const original = await db.manualSettlement.findFirstOrThrow({ where: { invoiceId: (await invoice()).id } });
   const body = await input('REVERSAL'); await mutate(path, body, a.cookie).expect(200);
   assert.equal((await invoice()).state, 'REVERSED'); assert.equal((await db.project.findUniqueOrThrow({ where: { id: a.projectId } })).balanceCents, 12500);
   await rejectDownload();
   const replay = await mutate(path, { invoiceId: original.invoiceId, expectedRevision: 0, kind: original.kind, reason: original.reason, confirmed: true }, a.cookie, original.requestKey).expect(200);
   assert.equal(replay.body.invoice.state, 'REVERSED'); await rejectDownload();
   assert.equal(await db.manualSettlement.count(), 2);
  });
  await t.test('quitação concorrente grava somente um evento; dispensa zero é explícita', async () => {
   const body = await input('WAIVER');
   const results = await Promise.all([1, 2].map(() => mutate(path, body, a.cookie)));
   assert.deepEqual(results.map(x => x.status).sort(), [200, 409]); assert.equal((await invoice()).state, 'WAIVED');
   const zi = await db.invoice.findFirstOrThrow({ where: { projectId: zero.projectId } });
   assert.equal(zi.state, 'OPEN');
   const z = { invoiceId: zi.id, expectedRevision: 0, kind: 'EXTERNAL_PAYMENT', reason: 'Teste de cobrança sem saldo', confirmed: true };
   await mutate('/projects/' + zero.projectId + '/manual-settlement', z, zero.cookie).expect(409);
   await mutate('/projects/' + zero.projectId + '/manual-settlement', { ...z, kind: 'WAIVER' }, zero.cookie).expect(200);
  });
  await t.test('falha de assinatura não registra grant; versão nova exige aprovação própria; arquivo e projeto ativos', async () => {
   const before = await db.originalGrant.count(); failSigning = true; await rejectDownload(); failSigning = false;
   assert.equal(await db.originalGrant.count(), before);
   await db.projectVersion.update({ where: { id: a.version.id }, data: { state: 'SUPERSEDED' } }); await rejectDownload();
   const next = await db.projectVersion.create({ data: { workspaceId: a.workspaceId, projectId: a.projectId, number: 2, state: 'PUBLISHED', publishedAt: new Date(), publishedById: a.userId } });
   const newer = await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: next.id, fileName: 'new.zip', mime: 'application/zip', sizeBytes: 1n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
   await assert.rejects(service.download(a.req, newer.id));
   await db.approval.create({ data: { workspaceId: a.workspaceId, versionId: next.id, guestSessionId: a.session.id, authorEmail: 'client@example.com' } });
   await service.download(a.req, newer.id);
   await db.project.update({ where: { id: a.projectId }, data: { status: 'ARCHIVED' } });
   await assert.rejects(service.download(a.req, newer.id)); await mutate(path, await input('REVERSAL'), a.cookie).expect(409);
  });
 }
});
