import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { RevisionsService } from '../src/revisions.service.js';
import { CommentsService } from '../src/comments.service.js';
import { FilesService } from '../src/files.service.js';
import { digest, newToken } from '../src/security.js';
import type { GuestRequest } from '../src/sharing.service.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const url = new URL(databaseUrl);
if (url.port !== '5433' || url.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(url.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');
test('rodadas: limites, decisão, concorrência e publicação', async t => {
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { quiet: true });
 const { db } = server; const http = server.app.getHttpServer(); const service = server.app.get(RevisionsService);
 const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
 const mutate = (path: string, body: object, cookie = '', key: string = randomUUID()) => request(http).post('/api/v1' + path).set('Origin', 'http://localhost:8080')
  .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], cookie]).set('Idempotency-Key', key).send(body);
 async function account(included: number) {
  const r = await mutate('/auth/register', { name: 'QA', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123', workspaceName: 'Rounds QA' }).expect(201);
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
  const client = await mutate('/clients', { name: 'QA', email: 'client@example.com' }, cookie).expect(201);
  const project = await mutate('/projects', { clientId: client.body.id, title: 'QA', balanceCents: 0, includedRevisionRounds: included }, cookie).expect(201);
  const workspaceId = r.body.workspace.id as string; const projectId = project.body.id as string;
  const version = await db.projectVersion.create({ data: { workspaceId, projectId, number: 1, state: 'PUBLISHED', publishedAt: new Date(), publishedById: r.body.user.id as string } });
  const asset = await db.asset.create({ data: { workspaceId, versionId: version.id, fileName: 'qa.zip', mime: 'application/zip', sizeBytes: 1n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
  const share = await db.shareLink.create({ data: { workspaceId, projectId, tokenHash: digest(newToken()), expiresAt: new Date(Date.now() + 86400000) } });
  const token = newToken(); const session = await db.guestSession.create({ data: { shareId: share.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000), verifiedAt: new Date(), verifiedEmail: 'client@example.com' } });
  return { workspaceId, projectId, versionId: version.id, cookie, guestCookie: 'cofre-guest=' + token, req: { cookies: { 'cofre-guest': token } } as unknown as GuestRequest, session, asset, userId: r.body.user.id as string, clientId: client.body.id as string };
 }
 async function next(a: Awaited<ReturnType<typeof account>>) {
  const v = await db.projectVersion.create({ data: { workspaceId: a.workspaceId, projectId: a.projectId, number: (await db.projectVersion.count({ where: { projectId: a.projectId } })) + 1 } });
  await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: v.id, fileName: 'next.zip', mime: 'application/zip', sizeBytes: 1n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
  return v;
 }
 try {
  const a = await account(1); const b = await account(0);
  const input = { versionId: a.versionId, summary: 'Ajustar título e cores' };
  await t.test('exige identidade, CSRF, chave UUID e texto válido', async () => {
   await mutate('/guest/revision-requests', input).expect(401);
   await request(http).post('/api/v1/guest/revision-requests').set('Cookie', a.guestCookie).send(input).expect(403);
   await mutate('/guest/revision-requests', input, a.guestCookie, 'invalid').expect(400);
   await mutate('/guest/revision-requests', input, a.guestCookie).unset('Idempotency-Key').expect(400);
   await mutate('/guest/revision-requests', { ...input, summary: ' ' }, a.guestCookie).expect(400);
   await db.guestSession.update({ where: { id: a.session.id }, data: { verifiedAt: null, verifiedEmail: null } });
   await mutate('/guest/revision-requests', input, a.guestCookie).expect(403);
   await db.guestSession.update({ where: { id: a.session.id }, data: { verifiedAt: new Date(), verifiedEmail: 'client@example.com' } });
  });
  await t.test('isola projeto/workspace e oculta rascunhos', async () => {
   await mutate('/guest/revision-requests', { ...input, versionId: b.versionId }, a.guestCookie).expect(404);
   const draft = await next(a);
   await mutate('/guest/revision-requests', { ...input, versionId: draft.id }, a.guestCookie).expect(404);
   await request(http).get(`/api/v1/projects/${a.projectId}/revisions`).set('Cookie', b.cookie).expect(404);
  });
  let roundId = '';
  await t.test('comentários não consomem rodada; pedido reúne snapshot e fecha coleta', async () => {
   const c = await server.app.get(CommentsService).create(a.req, { assetId: a.asset.id, clientRequestId: randomUUID(), body: 'Mudar a cor', anchor: { kind: 'GENERAL' } });
   assert.equal((await service.guest(a.req)).used, 0);
   const key = randomUUID();
   const results = await Promise.all([service.request(a.req, key, input), service.request(a.req, key, input)]);
   assert.equal(results[0]!.id, results[1]!.id); roundId = results[0]!.id;
   assert.equal(results[0]!.state, 'OPEN'); assert.equal(results[0]!.commentCount, 1);
   const stored = await db.revisionRound.findUniqueOrThrow({ where: { id: roundId } });
   assert.deepEqual(stored.commentIds, [c.id]); assert.equal(stored.authorEmail, 'client@example.com');
   assert.ok(!JSON.stringify(results[0]).includes('client@example.com'));
   await assert.rejects(service.request(a.req, key, { ...input, summary: 'outro' }));
   await assert.rejects(service.request(a.req, randomUUID(), input));
   await assert.rejects(server.app.get(CommentsService).create(a.req, { assetId: a.asset.id, clientRequestId: randomUUID(), body: 'tarde', anchor: { kind: 'GENERAL' } }));
   assert.equal((await service.guest(a.req)).used, 1);
  });
  await t.test('publicar encerra rodada e mantém histórico; repetição não reabre', async () => {
   const v = await next(a); const p = await db.project.findUniqueOrThrow({ where: { id: a.projectId } });
   await server.app.get(FilesService).publish(a.workspaceId, a.userId, v.id, p.revision);
   const history = await service.guest(a.req); assert.equal(history.items[0]!.state, 'RESOLVED'); assert.ok(history.items[0]!.resolvedAt);
   await assert.rejects(service.request(a.req, randomUUID(), input));
   const old = await db.revisionRound.findUniqueOrThrow({ where: { id: roundId } });
   assert.equal((await service.request(a.req, old.requestKey, input)).state, 'RESOLVED');
   a.versionId = v.id;
  });
  let extraId = '';
  await t.test('extra aguarda decisão; recusa não consome, aceite auditado consome uma vez', async () => {
   const dto = { versionId: a.versionId, summary: 'Rodada extra' };
   const extra = await service.request(a.req, randomUUID(), dto); assert.equal(extra.state, 'PENDING'); extraId = extra.id;
   assert.equal((await service.guest(a.req)).used, 1);
   await mutate(`/revisions/${extra.id}/decision`, { decision: 'ACCEPT', reason: 'Ok' }, b.cookie).expect(404);
   await mutate(`/revisions/${extra.id}/decision`, { decision: 'ACCEPT', reason: 'Ok' }, a.guestCookie).expect(401);
   await service.decide(a.workspaceId, a.userId, extra.id, { decision: 'REJECT', reason: 'Combinar escopo' });
   assert.equal((await service.guest(a.req)).used, 1);
   const retry = await service.request(a.req, randomUUID(), dto); extraId = retry.id;
   const decisions = await Promise.all([1, 2].map(() => service.decide(a.workspaceId, a.userId, retry.id, { decision: 'ACCEPT', reason: 'Escopo combinado' })));
   assert.equal(decisions[0]!.state, 'OPEN'); assert.equal((await service.guest(a.req)).used, 2);
   const stored = await db.revisionRound.findUniqueOrThrow({ where: { id: retry.id } }); assert.equal(stored.decidedById, a.userId); assert.ok(stored.decidedAt);
   await assert.rejects(service.decide(a.workspaceId, a.userId, retry.id, { decision: 'REJECT', reason: 'Mudei' }));
  });
  await t.test('publicação concorrente com pedido nunca deixa rodada ativa na versão antiga', async () => {
   const v = await next(b); const p = await db.project.findUniqueOrThrow({ where: { id: b.projectId } });
   const results = await Promise.allSettled([service.request(b.req, randomUUID(), { versionId: b.versionId, summary: 'Pedido concorrente' }), server.app.get(FilesService).publish(b.workspaceId, b.userId, v.id, p.revision)]);
   assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
   if (results[1]!.status === 'rejected') { const fresh = await db.project.findUniqueOrThrow({ where: { id: b.projectId } }); await server.app.get(FilesService).publish(b.workspaceId, b.userId, v.id, fresh.revision); }
   assert.equal(await db.revisionRound.count({ where: { projectId: b.projectId, state: { in: ['OPEN', 'PENDING'] } } }), 0);
   const old = await db.revisionRound.findFirst({ where: { projectId: b.projectId } }); if (old) assert.equal(old.state, 'CANCELLED');
  });
  await t.test('comentário concorrente entra no snapshot ou é bloqueado, nunca fica de fora', async () => {
   const c = await account(1);
   const results = await Promise.allSettled([
    service.request(c.req, randomUUID(), { versionId: c.versionId, summary: 'Ajustar' }),
    server.app.get(CommentsService).create(c.req, { assetId: c.asset.id, clientRequestId: randomUUID(), body: 'Comentário concorrente', anchor: { kind: 'GENERAL' } }),
   ]);
   assert.equal(results[0]!.status, 'fulfilled');
   const stored = await db.revisionRound.findFirstOrThrow({ where: { projectId: c.projectId } });
   const comments = await db.comment.findMany({ where: { versionId: c.versionId }, orderBy: { id: 'asc' } });
   assert.deepEqual(stored.commentIds, comments.map(comment => comment.id));
   assert.equal(comments.length, results[1]!.status === 'fulfilled' ? 1 : 0);
  });
  await t.test('mudança de email, revogação e arquivamento bloqueiam ações', async () => {
   await db.client.update({ where: { id: a.clientId }, data: { email: 'changed@example.com' } }); await assert.rejects(service.guest(a.req));
   await db.client.update({ where: { id: a.clientId }, data: { email: 'client@example.com' } });
   await db.guestSession.update({ where: { id: a.session.id }, data: { revokedAt: new Date() } }); await assert.rejects(service.guest(a.req));
   await db.guestSession.update({ where: { id: a.session.id }, data: { revokedAt: null } });
   await db.project.update({ where: { id: a.projectId }, data: { status: 'ARCHIVED' } }); await assert.rejects(service.guest(a.req));
   await assert.rejects(service.decide(a.workspaceId, a.userId, extraId, { decision: 'REJECT', reason: 'Não' }));
   assert.ok((await service.creator(a.workspaceId, a.projectId)).items.length);
  });
 } finally { await server.close(); }
});
