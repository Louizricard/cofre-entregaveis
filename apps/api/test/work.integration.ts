import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request, { type Response } from 'supertest';
import { createApp } from '../src/app.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Use o runner de integração.');
const target = new URL(databaseUrl);
if (target.port !== '5433' || target.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(target.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');
test('clientes e projetos com PostgreSQL e isolamento', async t => {
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { quiet: true });
 const http = server.app.getHttpServer();
 async function mutate(method: 'post' | 'patch', path: string, body: object, cookie = '') {
  const csrf = await request(http).get('/api/v1/auth/csrf');
  return request(http)[method]('/api/v1' + path).set('Cookie', [...(csrf.headers['set-cookie'] as unknown as string[]), cookie]).set('Origin', 'http://localhost:8080').set('X-CSRF-Token', csrf.body.csrfToken).send(body);
 }
 async function account() {
  const res = await mutate('post', '/auth/register', { name: 'Teste', workspaceName: 'Projetos', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123' });
  assert.equal(res.status, 201);
  return { cookie: (res.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0], workspaceId: res.body.workspace.id as string };
 }
 const a = await account(); const b = await account();
 let clientId = ''; let otherClient = ''; let projectId = '';
 const project = () => ({ clientId, title: 'Identidade visual', balanceCents: 12345, includedRevisionRounds: 2 });
 try {
  await t.test('clientes normalizados, duplicados concorrentes e escopo por workspace', async () => {
   const res = await mutate('post', '/clients', { name: '  Cliente Ana  ', email: '  CLIENTE@example.com ' }, a.cookie);
   assert.equal(res.status, 201); clientId = res.body.id;
   assert.equal(res.body.name, 'Cliente Ana'); assert.equal(res.body.email, 'cliente@example.com');
   assert.equal(res.body.workspaceId, undefined);
   assert.equal((await mutate('post', '/clients', { name: 'Ana', email: 'cliente@example.com' }, a.cookie)).status, 409);
   const other = await mutate('post', '/clients', { name: 'Outro', email: 'cliente@example.com' }, b.cookie);
   assert.equal(other.status, 201); otherClient = other.body.id;
   const duplicate = { name: 'Concorrência', email: 'race@example.com' };
   const results = await Promise.all([mutate('post', '/clients', duplicate, a.cookie), mutate('post', '/clients', duplicate, a.cookie)]);
   assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
   const listB = await request(http).get('/api/v1/clients').set('Cookie', b.cookie).expect(200);
   assert.equal(listB.body.items.length, 1); assert.equal(listB.body.items[0].id, otherClient);
   assert.equal((await mutate('patch', '/clients/' + clientId, { name: 'Roubo', email: 'x@example.com', revision: 1 }, b.cookie)).status, 404);
  });
  await t.test('criação, validação, FK composta e leitura sem vazamento', async () => {
   const res = await mutate('post', '/projects', project(), a.cookie);
   assert.equal(res.status, 201); projectId = res.body.id;
   assert.equal(res.body.currency, 'BRL'); assert.equal(res.body.client.id, clientId);
   assert.equal(res.body.balanceCents, 12345); assert.equal(res.body.status, 'ACTIVE');
   for (const data of [{ balanceCents: -1 }, { balanceCents: 1.5 }, { includedRevisionRounds: -1 }, { title: ' ' }, { workspaceId: b.workspaceId }, { balanceCents: 2147483648 }]) {
    assert.equal((await mutate('post', '/projects', { ...project(), ...data }, a.cookie)).status, 400);
   }
   assert.equal((await mutate('post', '/projects', { ...project(), clientId: otherClient }, a.cookie)).status, 404);
   await assert.rejects(server.db.project.create({ data: { ...project(), workspaceId: a.workspaceId, clientId: otherClient } }));
   await assert.rejects(server.db.project.create({ data: { ...project(), workspaceId: a.workspaceId, balanceCents: -1 } }));
   await request(http).get('/api/v1/projects/' + projectId).set('Cookie', b.cookie).expect(404);
   await request(http).get('/api/v1/projects').set('Cookie', b.cookie).expect(200, { items: [], nextCursor: null });
   await request(http).get('/api/v1/projects?workspaceId=' + a.workspaceId).set('Cookie', b.cookie).expect(400);
   assert.equal((await mutate('patch', '/projects/' + projectId, { ...project(), revision: 1 }, b.cookie)).status, 404);
   assert.equal((await mutate('post', '/projects/' + projectId + '/archive', { revision: 1 }, b.cookie)).status, 404);
  });
  await t.test('paginação sem repetição e busca de cliente/título', async () => {
   for (const title of ['Campanha', 'Editorial']) assert.equal((await mutate('post', '/projects', { ...project(), title }, a.cookie)).status, 201);
   const ids: string[] = []; let cursor: string | null = null;
   do {
    const res: Response = await request(http).get('/api/v1/projects').query({ limit: 1, ...(cursor ? { cursor } : {}) }).set('Cookie', a.cookie).expect(200);
    ids.push(...res.body.items.map((i: { id: string }) => i.id)); cursor = res.body.nextCursor;
   } while (cursor);
   assert.equal(new Set(ids).size, 3); assert.equal(ids.length, 3);
   const search = await request(http).get('/api/v1/projects?search=IDENTIDADE').set('Cookie', a.cookie).expect(200);
   assert.equal(search.body.items.length, 1);
   const clients = await request(http).get('/api/v1/clients?limit=1&search=cliente').set('Cookie', a.cookie).expect(200);
   assert.equal(clients.body.items[0].id, clientId);
   await request(http).get('/api/v1/projects?limit=0').set('Cookie', a.cookie).expect(400);
   await request(http).get('/api/v1/projects?cursor=invalido').set('Cookie', a.cookie).expect(400);
  });
  await t.test('edições concorrentes não sobrescrevem e arquivamento bloqueia edição', async () => {
   const results = await Promise.all(['Novo A', 'Novo B'].map(title => mutate('patch', '/projects/' + projectId, { ...project(), title, revision: 1 }, a.cookie)));
   assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
   const res = await mutate('post', '/projects/' + projectId + '/archive', { revision: 2 }, a.cookie);
   assert.equal(res.status, 200); assert.equal(res.body.status, 'ARCHIVED'); assert.equal(res.body.revision, 3);
   assert.equal((await mutate('patch', '/projects/' + projectId, { ...project(), revision: 3 }, a.cookie)).status, 409);
   const list = await request(http).get('/api/v1/projects?status=ARCHIVED').set('Cookie', a.cookie).expect(200);
   assert.equal(list.body.items.length, 1); assert.equal(list.body.items[0].id, projectId);
   const edits = await Promise.all(['Ana A', 'Ana B'].map(name => mutate('patch', '/clients/' + clientId, { name, email: 'cliente@example.com', revision: 1 }, a.cookie)));
   assert.deepEqual(edits.map(r => r.status).sort(), [200, 409]);
  });
  await t.test('sessão, CSRF e Origin exigidos em todas as mutações', async () => {
   await request(http).get('/api/v1/clients').expect(401);
   await request(http).get('/api/v1/projects').expect(401);
   const routes: ['post' | 'patch', string, object][] = [['post', '/clients', { name: 'X', email: 'x@example.com' }], ['patch', '/clients/' + clientId, { name: 'X', email: 'x@example.com', revision: 2 }], ['post', '/projects', project()], ['patch', '/projects/' + projectId, { ...project(), revision: 3 }], ['post', '/projects/' + projectId + '/archive', { revision: 3 }]];
   for (const [method, path, body] of routes) {
    await request(http)[method]('/api/v1' + path).set('Cookie', a.cookie).set('Origin', 'http://localhost:8080').send(body).expect(403);
    const csrf = await request(http).get('/api/v1/auth/csrf');
    await request(http)[method]('/api/v1' + path).set('Cookie', [...(csrf.headers['set-cookie'] as unknown as string[]), a.cookie]).set('Origin', 'https://evil.example').set('X-CSRF-Token', csrf.body.csrfToken).send(body).expect(403);
   }
  });
 } finally { await server.close(); }
});
