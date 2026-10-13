import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const target = new URL(databaseUrl);
if (target.port !== '5433' || target.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Banco de teste não isolado.');

test('clientes e projetos persistidos e isolados por workspace', async t => {
 const origin = 'http://localhost:8080';
 const server = await createApp({ databaseUrl, origin, production: false, sessionDays: 7, port: 3000 }, { quiet: true });
 const http = server.app.getHttpServer();
 async function post(path: string, body: object, cookie = '') {
  const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
  return request(http).post('/api/v1' + path).set('Origin', origin).set('X-CSRF-Token', csrf.body.csrfToken)
   .set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], ...(cookie ? [cookie] : [])]).send(body);
 }
 async function account() {
  const r = await post('/auth/register', { email: randomUUID() + '@example.com', name: 'Ana', workspaceName: 'Studio', password: 'senha-segura-123' });
  assert.equal(r.status, 201);
  return { workspaceId: r.body.workspace.id as string, cookie: (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0] };
 }
 try {
  const a = await account(); const b = await account();
  const clientEmail = 'cliente@example.com';
  let clientId = ''; let otherClientId = ''; let projectId = '';
  const projectInput = () => ({ clientId, title: 'Identidade visual', balanceCents: 150050, includedRevisionRounds: 2 });
  await t.test('normaliza cliente, evita duplicidade concorrente e permite mesmo email em outro workspace', async () => {
   const results = await Promise.all([1, 2].map(() => post('/clients', { name: '  Cliente A  ', email: '  CLIENTE@example.com ' }, a.cookie)));
   assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
   const created = results.find(r => r.status === 201)!;
   assert.equal(created.body.name, 'Cliente A'); assert.equal(created.body.email, clientEmail);
   assert.equal(created.body.workspaceId, undefined); clientId = created.body.id;
   const other = await post('/clients', { name: 'Cliente B', email: clientEmail }, b.cookie);
   assert.equal(other.status, 201); otherClientId = other.body.id;
   assert.equal(await server.db.client.count({ where: { workspaceId: a.workspaceId } }), 1);
  });
  await t.test('valida entradas, autenticação e CSRF em clientes/projetos', async () => {
   for (const path of ['/clients', '/projects']) {
    await request(http).get('/api/v1' + path).expect(401);
    assert.equal((await post(path, {}, '')).status, 401);
    await request(http).post('/api/v1' + path).set('Cookie', a.cookie).set('Origin', origin).send({}).expect(403);
    await request(http).get('/api/v1' + path + '?limit=101').set('Cookie', a.cookie).expect(400);
    await request(http).get('/api/v1' + path + '?limit=1.5').set('Cookie', a.cookie).expect(400);
    await request(http).get('/api/v1' + path + '?cursor=invalid').set('Cookie', a.cookie).expect(400);
    await request(http).get('/api/v1' + path + '?workspaceId=' + b.workspaceId).set('Cookie', a.cookie).expect(400);
   }
   for (const body of [{ name: ' ', email: clientEmail }, { name: 'Ana', email: 'bad' }, { name: 'Ana', email: clientEmail, workspaceId: b.workspaceId }]) {
    assert.equal((await post('/clients', body, a.cookie)).status, 400);
   }
   for (const invalid of [{ balanceCents: -1 }, { balanceCents: 1.5 }, { balanceCents: 2147483648 }, { balanceCents: '100' },
    { includedRevisionRounds: -1 }, { includedRevisionRounds: 1001 }, { includedRevisionRounds: 1.5 }, { title: ' ' }, { clientId: 'bad' }, { currency: 'USD' }, { workspaceId: b.workspaceId }]) {
    assert.equal((await post('/projects', { ...projectInput(), ...invalid }, a.cookie)).status, 400);
   }
   assert.equal(await server.db.project.count({ where: { workspaceId: a.workspaceId } }), 0);
  });
  await t.test('paginação e busca de clientes nunca incluem outro workspace', async () => {
   await post('/clients', { name: 'Segundo', email: 'segundo@example.com' }, a.cookie);
   const first = await request(http).get('/api/v1/clients?limit=1').set('Cookie', a.cookie).expect(200);
   assert.equal(first.body.items.length, 1); assert.ok(first.body.nextCursor);
   const second = await request(http).get('/api/v1/clients?limit=1&cursor=' + first.body.nextCursor).set('Cookie', a.cookie).expect(200);
   assert.equal(second.body.items.length, 1); assert.equal(second.body.nextCursor, null);
   assert.notEqual(first.body.items[0].id, second.body.items[0].id);
   assert.ok([first.body.items[0].id, second.body.items[0].id].every(id => id !== otherClientId));
   const search = await request(http).get('/api/v1/clients?search=CLIENTE@').set('Cookie', a.cookie).expect(200);
   assert.equal(search.body.items.length, 1); assert.equal(search.body.items[0].id, clientId);
   await request(http).get('/api/v1/clients?cursor=' + otherClientId).set('Cookie', a.cookie).expect(400);
  });
  await t.test('cria projeto BRL e bloqueia cliente externo na API e no banco', async () => {
   assert.equal((await post('/projects', { ...projectInput(), clientId: otherClientId }, a.cookie)).status, 404);
   assert.equal((await post('/projects', { ...projectInput(), clientId: randomUUID() }, a.cookie)).status, 404);
   await assert.rejects(server.db.project.create({ data: { ...projectInput(), clientId: otherClientId, workspaceId: a.workspaceId } }));
   const created = await post('/projects', projectInput(), a.cookie);
   assert.equal(created.status, 201); projectId = created.body.id;
   assert.equal(created.body.currency, 'BRL'); assert.equal(created.body.balanceCents, 150050);
   assert.equal(created.body.client.id, clientId); assert.equal(created.body.status, 'ACTIVE');
   const saved = await server.db.project.findUniqueOrThrow({ where: { id: projectId } });
   assert.equal(saved.workspaceId, a.workspaceId); assert.equal(saved.includedRevisionRounds, 2);
   await assert.rejects(server.db.project.create({ data: { ...projectInput(), workspaceId: a.workspaceId, balanceCents: -1 } }));
   await request(http).get('/api/v1/projects/' + projectId).set('Cookie', b.cookie).expect(404);
   await request(http).get('/api/v1/projects/' + projectId).expect(401);
   await request(http).get('/api/v1/projects/invalid').set('Cookie', a.cookie).expect(400);
   const read = await request(http).get('/api/v1/projects/' + projectId).set('Cookie', a.cookie).expect(200);
   assert.equal(read.body.title, 'Identidade visual');
   await request(http).get('/api/v1/projects').set('Cookie', b.cookie).expect(200, { items: [], nextCursor: null });
  });
  await t.test('pagina projetos, filtra título e arquiva de forma idempotente com isolamento', async () => {
   assert.equal((await post('/projects', { ...projectInput(), title: 'Vídeo', balanceCents: 0, includedRevisionRounds: 0 }, a.cookie)).status, 201);
   const first = await request(http).get('/api/v1/projects?limit=1').set('Cookie', a.cookie).expect(200);
   const second = await request(http).get('/api/v1/projects?limit=1&cursor=' + first.body.nextCursor).set('Cookie', a.cookie).expect(200);
   assert.equal(first.body.items.length, 1); assert.equal(second.body.items.length, 1);
   assert.notEqual(first.body.items[0].id, second.body.items[0].id); assert.equal(second.body.nextCursor, null);
   await request(http).get('/api/v1/projects?cursor=' + projectId).set('Cookie', b.cookie).expect(400);
   const search = await request(http).get('/api/v1/projects?search=VISUAL').set('Cookie', a.cookie).expect(200);
   assert.equal(search.body.items.length, 1); assert.equal(search.body.items[0].id, projectId);
   await request(http).post('/api/v1/projects/' + projectId + '/archive').set('Cookie', a.cookie).set('Origin', origin).send({}).expect(403);
   assert.equal((await post('/projects/' + projectId + '/archive', {}, b.cookie)).status, 404);
   assert.equal((await post('/projects/' + projectId + '/archive', { status: 'ACTIVE' }, a.cookie)).status, 400);
   const archived = await post('/projects/' + projectId + '/archive', {}, a.cookie);
   assert.equal(archived.status, 200); assert.equal(archived.body.status, 'ARCHIVED');
   const again = await post('/projects/' + projectId + '/archive', {}, a.cookie);
   assert.equal(again.status, 200); assert.equal(again.body.updatedAt, archived.body.updatedAt);
   const active = await request(http).get('/api/v1/projects?status=ACTIVE').set('Cookie', a.cookie).expect(200);
   assert.equal(active.body.items.length, 1); assert.notEqual(active.body.items[0].id, projectId);
   const history = await request(http).get('/api/v1/projects?status=ARCHIVED').set('Cookie', a.cookie).expect(200);
   assert.equal(history.body.items.length, 1); assert.equal(history.body.items[0].id, projectId);
  });
 } finally { await server.close(); }
});
