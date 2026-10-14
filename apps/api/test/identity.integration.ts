import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { IdentityService } from '../src/identity.service.js';
import { SharingService, type GuestRequest } from '../src/sharing.service.js';
import { digest, newToken } from '../src/security.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const url = new URL(databaseUrl);
if (url.port !== '5433' || url.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(url.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');
test('identidade: código vinculado ao cliente/sessão, fila cifrada e falha fechada', async t => {
 const messages: { to: string; code: string; id: string }[] = []; let fail = false;
 const config = { databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000,
  email: { apiKey: 're_test', from: 'cofre@example.com', identityKey: randomBytes(32).toString('hex') } };
 const server = await createApp(config, { quiet: true, mailer: { send: async (to, code, id) => { messages.push({ to, code, id }); if (fail) throw new Error('provider failed'); } } });
 const { db } = server; const http = server.app.getHttpServer(); const service = server.app.get(IdentityService);
 const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
 const mutate = (path: string, body: object, cookie = '') => request(http).post('/api/v1' + path).set('Origin', config.origin)
  .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], cookie]).send(body);
 const registered = await mutate('/auth/register', { name: 'QA', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123', workspaceName: 'Identity QA' }).expect(201);
 const creatorCookie = (registered.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
 const client = await mutate('/clients', { name: 'QA', email: 'client@example.com' }, creatorCookie).expect(201);
 const project = await mutate('/projects', { clientId: client.body.id, title: 'QA', balanceCents: 0, includedRevisionRounds: 2 }, creatorCookie).expect(201);
 const share = await db.shareLink.create({ data: { workspaceId: registered.body.workspace.id as string, projectId: project.body.id as string, tokenHash: digest(newToken()), expiresAt: new Date(Date.now() + 86400000) } });
 async function guest() {
  const token = newToken(); const session = await db.guestSession.create({ data: { shareId: share.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000) } });
  return { id: session.id, req: { cookies: { 'cofre-guest': token } } as unknown as GuestRequest, cookie: 'cofre-guest=' + token };
 }
 const last = () => messages.at(-1)!;
 t.beforeEach(async () => { messages.length = 0; fail = false; await db.identityRequest.updateMany({ data: { createdAt: new Date(0) } }); });
 t.afterEach(async () => { await db.identityChallenge.updateMany({ data: { deliveryState: 'CANCELLED', consumedAt: new Date(), encryptedCode: null, leaseToken: null, leaseUntil: null } }); });
 try {
  await t.test('HTTP exige sessão/CSRF, normaliza e-mail e nunca devolve código ou destinatário', async () => {
   const a = await guest();
   await request(http).get('/api/v1/guest/identity').expect(401);
   await request(http).post('/api/v1/guest/identity/request').set('Cookie', a.cookie).send({ email: 'client@example.com' }).expect(403);
   const r = await mutate('/guest/identity/request', { email: ' CLIENT@EXAMPLE.COM ' }, a.cookie).expect(202);
   assert.ok(!JSON.stringify(r.body).includes('client@example.com'));
   assert.equal(messages.length, 0); await service.deliverOnce();
   assert.equal(last().to, 'client@example.com'); assert.ok(!JSON.stringify(r.body).includes(last().code));
  });
  await t.test('e-mail errado e cooldown recebem a mesma resposta e não disparam envio', async () => {
   const a = await guest(); const b = await guest();
   const wrong = await service.request(a.req, 'other@example.com'); const right = await service.request(b.req, 'client@example.com');
   assert.deepEqual(wrong, right); assert.deepEqual(await service.request(b.req, 'client@example.com'), right);
   assert.equal(await db.identityChallenge.count({ where: { sessionId: a.id } }), 0);
   assert.equal(await db.identityRequest.count({ where: { sessionId: b.id } }), 1);
  });
  await t.test('desafio cifrado é entregue uma vez e código confirma só a sessão que o pediu', async () => {
   const a = await guest(); const b = await guest(); await service.request(a.req, 'client@example.com');
   const challenge = await db.identityChallenge.findUniqueOrThrow({ where: { sessionId: a.id } });
   await Promise.all([service.deliverOnce(), service.deliverOnce()]); assert.equal(messages.length, 1);
   assert.notEqual(challenge.codeHash, digest(last().code)); assert.notEqual(challenge.encryptedCode, last().code); assert.equal((await db.identityChallenge.findUniqueOrThrow({ where: { sessionId: a.id } })).encryptedCode, null);
   await assert.rejects(service.verify(b.req, last().code));
   assert.equal((await service.verify(a.req, last().code)).verified, true); await assert.rejects(service.verify(a.req, last().code));
   assert.equal((await service.status(a.req)).verified, true); assert.equal((await service.status(b.req)).verified, false);
   assert.equal((await db.guestSession.findUniqueOrThrow({ where: { id: a.id } })).verifiedEmail, 'client@example.com');
  });
  await t.test('cinco erros persistem mesmo com resposta de erro e encerram o desafio', async () => {
   const a = await guest(); await service.request(a.req, 'client@example.com'); await service.deliverOnce();
   const wrong = last().code === '000000' ? '111111' : '000000';
   for (let i = 0; i < 5; i++) await assert.rejects(service.verify(a.req, wrong));
   const c = await db.identityChallenge.findUniqueOrThrow({ where: { sessionId: a.id } }); assert.equal(c.attempts, 5); assert.ok(c.consumedAt);
   await assert.rejects(service.verify(a.req, last().code)); assert.equal((await service.status(a.req)).verified, false);
  });
  await t.test('expiração e reenvio invalidam código anterior sem expor o novo', async () => {
   const a = await guest(); await service.request(a.req, 'client@example.com'); await service.deliverOnce(); const first = last();
   await db.identityChallenge.updateMany({ where: { sessionId: a.id }, data: { expiresAt: new Date(0) } }); await assert.rejects(service.verify(a.req, first.code));
   await db.identityRequest.updateMany({ where: { sessionId: a.id }, data: { createdAt: new Date(0) } });
   await service.request(a.req, 'client@example.com'); await service.deliverOnce(); assert.notEqual(last().id, first.id);
   assert.notEqual(first.code, last().code); await assert.rejects(service.verify(a.req, first.code));
   assert.equal((await service.verify(a.req, last().code)).verified, true);
  });
  await t.test('envio com resposta perdida repete a mesma chave/código e para após três falhas', async () => {
   const a = await guest(); fail = true; await service.request(a.req, 'client@example.com'); await service.deliverOnce(); const first = last();
   await assert.rejects(service.verify(a.req, first.code));
   await db.identityChallenge.updateMany({ where: { sessionId: a.id }, data: { nextAttemptAt: new Date(0) } }); fail = false; await service.deliverOnce();
   assert.deepEqual(last(), first); assert.equal((await service.verify(a.req, last().code)).verified, true);
   const b = await guest(); fail = true; await service.request(b.req, 'client@example.com');
   for (let i = 0; i < 3; i++) { await db.identityChallenge.updateMany({ where: { sessionId: b.id }, data: { nextAttemptAt: new Date(0) } }); await service.deliverOnce(); }
   const c = await db.identityChallenge.findUniqueOrThrow({ where: { sessionId: b.id } }); assert.equal(c.deliveryAttempts, 3); assert.equal(c.deliveryState, 'FAILED'); assert.equal(c.encryptedCode, null);
  });
  await t.test('lease abandonado é recuperado sem ficar RUNNING após última tentativa', async () => {
   const a = await guest(); await service.request(a.req, 'client@example.com');
   await db.identityChallenge.updateMany({ where: { sessionId: a.id }, data: { deliveryState: 'RUNNING', deliveryAttempts: 2, leaseToken: randomUUID(), leaseUntil: new Date(0) } });
   await service.deliverOnce(); assert.equal(messages.length, 1);
   const b = await guest(); await service.request(b.req, 'client@example.com');
   await db.identityChallenge.updateMany({ where: { sessionId: b.id }, data: { deliveryState: 'RUNNING', deliveryAttempts: 3, leaseToken: randomUUID(), leaseUntil: new Date(0) } });
   await service.deliverOnce(); assert.equal((await db.identityChallenge.findUniqueOrThrow({ where: { sessionId: b.id } })).deliveryState, 'CANCELLED');
  });
  await t.test('dez pedidos por projeto/hora têm limite concorrente entre sessões', async () => {
   for (let i = 0; i < 9; i++) await service.request((await guest()).req, 'client@example.com');
   const a = await guest(); const b = await guest(); await Promise.all([service.request(a.req, 'client@example.com'), service.request(b.req, 'client@example.com')]);
   assert.equal(await db.identityRequest.count({ where: { createdAt: { gt: new Date(Date.now() - 3600000) } } }), 10);
  });
  await t.test('sem provedor fica desabilitado e não produz confirmação falsa', async () => {
   const a = await guest(); const disabled = new IdentityService(db, config, null, false, server.app.get(SharingService));
   assert.equal((await disabled.status(a.req)).enabled, false); await assert.rejects(disabled.request(a.req, 'client@example.com'));
   assert.equal((await disabled.status(a.req)).verified, false);
  });
  await t.test('mudança de e-mail, revogação e arquivamento não permitem reaproveitar identidade', async () => {
   const a = await guest(); await service.request(a.req, 'client@example.com'); await service.deliverOnce(); await service.verify(a.req, last().code);
   await db.client.update({ where: { id: client.body.id as string }, data: { email: 'changed@example.com' } }); assert.equal((await service.status(a.req)).verified, false);
   const b = await guest(); await service.request(b.req, 'changed@example.com');
   await db.guestSession.update({ where: { id: b.id }, data: { revokedAt: new Date() } }); await service.deliverOnce(); assert.equal(messages.length, 1);
   await assert.rejects(service.status(b.req));
   const c = await guest(); await service.request(c.req, 'changed@example.com');
   await db.project.update({ where: { id: project.body.id as string }, data: { status: 'ARCHIVED' } }); await service.deliverOnce(); assert.equal(messages.length, 1);
   await assert.rejects(service.status(c.req));
  });
 } finally { await server.close(); }
});
