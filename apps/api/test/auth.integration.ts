import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { digest } from '../src/security.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration com PostgreSQL de teste.');
const target = new URL(databaseUrl);
if (target.port !== '5433' || target.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Banco de teste não isolado.');
test('autenticação integrada com PostgreSQL real e migrations', async t => {
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { quiet: true });
 const http = server.app.getHttpServer();
 const origin = 'http://localhost:8080';
 const password = 'uma-senha-segura-123';
 const email = randomUUID() + '@example.com';
 const input = { name: 'Ana', workspaceName: 'Studio Ana', email, password };
 async function csrf() {
  const response = await request(http).get('/api/v1/auth/csrf').expect(200);
  return { token: response.body.csrfToken as string, cookies: response.headers['set-cookie'] as unknown as string[] };
 }
 async function post(path: string, body: object, session?: string, ip?: string) {
  const protection = await csrf();
  const req = request(http).post('/api/v1' + path).set('Origin', origin).set('X-CSRF-Token', protection.token)
   .set('Cookie', [...protection.cookies, ...(session ? [session] : [])]);
  if (ip) req.set('X-Forwarded-For', ip);
  return req.send(body);
 }
 let cookie = ''; let userId = ''; let workspaceId = '';
 try {
  await t.test('cadastro atômico cria OWNER e armazena somente hash', async () => {
   const response = await post('/auth/register', { ...input, email: '  ' + email.toUpperCase() + ' ' });
   assert.equal(response.status, 201);
   userId = response.body.user.id; workspaceId = response.body.workspace.id;
   assert.equal(response.body.user.email, email);
   assert.deepEqual(Object.keys(response.body).sort(), ['user', 'workspace']);
   assert.equal(response.body.user.passwordHash, undefined);
   cookie = (response.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
   assert.match((response.headers['set-cookie'] as unknown as string[]).join(';'), /HttpOnly/);
   assert.match((response.headers['set-cookie'] as unknown as string[]).join(';'), /SameSite=Lax/);
   const user = await server.db.user.findUniqueOrThrow({ where: { id: userId } });
   assert.match(user.passwordHash, /^\$argon2id\$/);
   const member = await server.db.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId } } });
   assert.equal(member.role, 'OWNER');
   const session = await server.db.session.findFirstOrThrow({ where: { userId } });
   assert.equal(session.tokenHash, digest(cookie.split('=')[1]));
  });
  await t.test('me, projects e isolamento de duas contas', async () => {
   const a = await request(http).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
   assert.equal(a.body.workspace.id, workspaceId);
   await request(http).get('/api/v1/projects').set('Cookie', cookie).expect(200, { items: [], nextCursor: null });
   const b = await post('/auth/register', { ...input, email: randomUUID() + '@example.com', workspaceName: 'Studio B' });
   assert.equal(b.status, 201);
   const bCookie = (b.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
   assert.notEqual(b.body.workspace.id, workspaceId);
   const readB = await request(http).get('/api/v1/auth/me?workspaceId=' + workspaceId).set('Cookie', bCookie).expect(200);
   assert.equal(readB.body.workspace.id, b.body.workspace.id);
   assert.notEqual(readB.body.user.id, userId);
   await request(http).get('/api/v1/auth/me').set('Authorization', 'Bearer ' + cookie.split('=')[1]).expect(401);
  });
  await t.test('duplicidade concorrente causa 409 sem workspace órfão', async () => {
   assert.equal((await post('/auth/register', input)).status, 409);
   const before = await server.db.workspace.count();
   const duplicate = { ...input, email: randomUUID() + '@example.com' };
   const results = await Promise.all([post('/auth/register', duplicate), post('/auth/register', duplicate)]);
   assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
   assert.equal(await server.db.workspace.count(), before + 1);
  });
  await t.test('login válido e senha incorreta', async () => {
   const invalid = await post('/auth/login', { email, password: 'uma-senha-incorreta' });
   assert.equal(invalid.status, 401); assert.equal(invalid.body.error.code, 'INVALID_CREDENTIALS');
   const missing = await post('/auth/login', { email: 'missing@example.com', password });
   assert.equal(missing.status, 401); assert.deepEqual(missing.body.error, invalid.body.error);
   const login = await post('/auth/login', { email, password });
   assert.equal(login.status, 200); assert.equal(login.body.user.id, userId);
  });
  await t.test('proteção CSRF e Origin', async () => {
   await request(http).post('/api/v1/auth/logout').set('Cookie', cookie).set('Origin', origin).send({}).expect(403);
   const protection = await csrf();
   for (const wrongOrigin of ['https://evil.example', 'null', origin + '.evil.example']) {
    await request(http).post('/api/v1/auth/logout').set('Cookie', [...protection.cookies, cookie]).set('Origin', wrongOrigin).set('X-CSRF-Token', protection.token).send({}).expect(403);
   }
   await request(http).post('/api/v1/auth/logout').set('Cookie', [...protection.cookies, cookie]).set('X-CSRF-Token', protection.token).send({}).expect(403);
   await request(http).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
  });
  await t.test('sessão expirada e membership removida são recusadas', async () => {
   await server.db.session.updateMany({ where: { userId }, data: { expiresAt: new Date(Date.now() - 1000) } });
   await request(http).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
   const login = await post('/auth/login', { email, password });
   cookie = (login.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
   await server.db.workspaceMember.delete({ where: { workspaceId_userId: { workspaceId, userId } } });
   await request(http).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
   await request(http).get('/api/v1/projects').set('Cookie', cookie).expect(401);
   assert.equal((await post('/auth/login', { email, password })).status, 401);
   await server.db.workspaceMember.create({ data: { workspaceId, userId, role: 'OWNER' } });
  });
  await t.test('logout revoga sessão, limpa cookie e é idempotente', async () => {
   const result = await post('/auth/logout', {}, cookie);
   assert.equal(result.status, 204); assert.equal(result.text, '');
   assert.match((result.headers['set-cookie'] as unknown as string[]).join(';'), /Expires=Thu, 01 Jan 1970/);
   await request(http).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
   const session = await server.db.session.findUniqueOrThrow({ where: { tokenHash: digest(cookie.split('=')[1]) } });
   assert.ok(session.revokedAt);
   assert.equal((await post('/auth/logout', {}, cookie)).status, 204);
  });
  await t.test('readiness consulta banco e rate limit auth', async () => {
   await request(http).get('/api/v1/ready').expect(200);
   let status = 0;
   for (let i = 0; i < 11; i++) status = (await post('/auth/login', { email, password: 'senha-errada-123' })).status;
   assert.equal(status, 429);
  });
 } finally { await server.close(); }
});
