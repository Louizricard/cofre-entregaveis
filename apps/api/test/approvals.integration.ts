import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ApprovalsService } from '../src/approvals.service.js';
import { RevisionsService } from '../src/revisions.service.js';
import { CommentsService } from '../src/comments.service.js';
import { FilesService } from '../src/files.service.js';
import { digest, newToken } from '../src/security.js';
import type { GuestRequest } from '../src/sharing.service.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const url = new URL(databaseUrl);
if (url.port !== '5433' || url.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(url.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');
test('aprovação explícita da versão e concorrência', async t => {
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { quiet: true });
 const { db } = server; const http = server.app.getHttpServer(); const service = server.app.get(ApprovalsService);
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
  const input = { versionId: a.versionId, confirmed: true }; const key = randomUUID();
  await t.test('confirmação explícita, identidade, CSRF e chave são obrigatórios', async () => {
   await mutate('/guest/approvals', input).expect(401);
   await request(http).post('/api/v1/guest/approvals').set('Cookie', a.guestCookie).send(input).expect(403);
   await mutate('/guest/approvals', input, a.guestCookie, 'invalid').expect(400);
   await mutate('/guest/approvals', input, a.guestCookie).unset('Idempotency-Key').expect(400);
   for (const value of [false, 'true', null]) await mutate('/guest/approvals', { ...input, confirmed: value }, a.guestCookie).expect(400);
   await mutate('/guest/approvals', { versionId: a.versionId }, a.guestCookie).expect(400);
   await db.guestSession.update({ where: { id: a.session.id }, data: { verifiedAt: null, verifiedEmail: null } });
   await assert.rejects(service.guest(a.req, a.versionId)); await assert.rejects(service.create(a.req, key, input));
   await db.guestSession.update({ where: { id: a.session.id }, data: { verifiedAt: new Date(), verifiedEmail: 'client@example.com' } });
  });
  await t.test('isola workspace, outro projeto no mesmo workspace e oculta rascunho', async () => {
   await assert.rejects(service.guest(b.req, a.versionId)); await assert.rejects(service.creator(b.workspaceId, a.versionId));
   await assert.rejects(service.create(a.req, key, { ...input, versionId: b.versionId }));
   const hidden = await db.project.create({ data: { workspaceId: a.workspaceId, clientId: a.clientId, title: 'Privado', balanceCents: 0, includedRevisionRounds: 0 } });
   const version = await db.projectVersion.create({ data: { workspaceId: a.workspaceId, projectId: hidden.id, number: 1, state: 'PUBLISHED', publishedAt: new Date(), publishedById: a.userId } });
   await assert.rejects(service.create(a.req, randomUUID(), { versionId: version.id, confirmed: true }));
   const draft = await next(a); await assert.rejects(service.guest(a.req, draft.id)); await assert.rejects(service.create(a.req, key, { ...input, versionId: draft.id }));
   assert.equal((await service.creator(a.workspaceId, draft.id)).canApprove, false);
  });
  await t.test('segurança vencida, arquivo não pronto e prévia pendente impedem aprovação', async () => {
   await db.asset.update({ where: { id: a.asset.id }, data: { scannedAt: new Date(0) } });
   assert.equal((await service.guest(a.req, a.versionId)).canApprove, false); await assert.rejects(service.create(a.req, key, input));
   await db.asset.update({ where: { id: a.asset.id }, data: { scannedAt: new Date(), scanStatus: 'REJECTED' } }); await assert.rejects(service.create(a.req, key, input));
   await db.asset.update({ where: { id: a.asset.id }, data: { scanStatus: 'CLEAN', status: 'VALIDATING' } }); await assert.rejects(service.create(a.req, key, input));
   await db.asset.update({ where: { id: a.asset.id }, data: { status: 'READY', mime: 'image/png' } }); await assert.rejects(service.create(a.req, key, input));
   await db.mediaJob.create({ data: { assetId: a.asset.id, state: 'FAILED' } }); await assert.rejects(service.create(a.req, key, input));
   await db.mediaJob.update({ where: { assetId: a.asset.id }, data: { state: 'READY' } });
   assert.equal((await service.guest(a.req, a.versionId)).canApprove, true);
  });
  await t.test('rodada em andamento bloqueia; recusa extra permite aprovar', async () => {
   const round = await server.app.get(RevisionsService).request(b.req, randomUUID(), { versionId: b.versionId, summary: 'Pedido extra' });
   assert.equal(round.state, 'PENDING'); await assert.rejects(service.create(b.req, randomUUID(), { versionId: b.versionId, confirmed: true }));
   await server.app.get(RevisionsService).decide(b.workspaceId, b.userId, round.id, { decision: 'REJECT', reason: 'Fora do escopo' });
   assert.equal((await service.guest(b.req, b.versionId)).canApprove, true);
  });
  await t.test('aprovação concorrente é única, auditada e não libera originais', async () => {
   const results = await Promise.all([service.create(a.req, key, input), service.create(a.req, key, input), service.create(a.req, randomUUID(), input)]);
   assert.ok(results.every(r => r.id === results[0]!.id)); assert.equal(await db.approval.count({ where: { versionId: a.versionId } }), 1);
   const saved = await db.approval.findUniqueOrThrow({ where: { versionId: a.versionId } });
   assert.equal(saved.guestSessionId, a.session.id); assert.equal(saved.authorEmail, 'client@example.com'); assert.ok(saved.createdAt);
   assert.ok(!JSON.stringify(results).includes('client@example.com')); assert.ok(!JSON.stringify(results).includes('guestSessionId'));
   const creator = await request(http).get(`/api/v1/versions/${a.versionId}/approval`).set('Cookie', a.cookie).expect(200);
   assert.equal(creator.body.approval.id, saved.id); assert.equal(creator.body.canApprove, false);
   await mutate(`/assets/${a.asset.id}/download`, {}, a.guestCookie).expect(401);
   assert.equal((await server.app.get(CommentsService).guest(a.req, a.asset.id, {})).canComment, false);
   await assert.rejects(server.app.get(CommentsService).create(a.req, { assetId: a.asset.id, clientRequestId: randomUUID(), body: 'tarde', anchor: { kind: 'GENERAL' } }));
   assert.equal((await server.app.get(RevisionsService).guest(a.req)).canRequest, false);
   await assert.rejects(server.app.get(RevisionsService).request(a.req, randomUUID(), { versionId: a.versionId, summary: 'tarde' }));
  });
  await t.test('nova publicação exige outra aprovação e conserva replay/histórico', async () => {
   const previousId = a.versionId; const v = await next(a); const p = await db.project.findUniqueOrThrow({ where: { id: a.projectId } });
   await server.app.get(FilesService).publish(a.workspaceId, a.userId, v.id, p.revision);
   const history = await service.guest(a.req, previousId); assert.ok(history.approval); assert.equal(history.canApprove, false);
   assert.equal((await service.create(a.req, key, input)).versionId, previousId);
   await assert.rejects(service.create(a.req, randomUUID(), input));
   const current = await service.guest(a.req, v.id); assert.equal(current.approval, null); assert.equal(current.canApprove, true);
   await assert.rejects(service.create(a.req, key, { versionId: v.id, confirmed: true }));
   await service.create(a.req, randomUUID(), { versionId: v.id, confirmed: true }); assert.equal(await db.approval.count({ where: { workspaceId: a.workspaceId } }), 2);
   a.versionId = v.id;
  });
  await t.test('aprovação concorrente com pedido de ajustes tem um único vencedor', async () => {
   const results = await Promise.allSettled([
    service.create(b.req, randomUUID(), { versionId: b.versionId, confirmed: true }),
    server.app.get(RevisionsService).request(b.req, randomUUID(), { versionId: b.versionId, summary: 'Novo pedido' }),
   ]);
   assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
   assert.ok(!(await db.approval.count({ where: { versionId: b.versionId } }) && await db.revisionRound.count({ where: { versionId: b.versionId, state: { in: ['OPEN', 'PENDING'] } } })));
  });
  await t.test('publicação concorrente nunca aprova a nova versão implicitamente', async () => {
   const c = await account(1); const v = await next(c); const p = await db.project.findUniqueOrThrow({ where: { id: c.projectId } });
   const results = await Promise.allSettled([
    service.create(c.req, randomUUID(), { versionId: c.versionId, confirmed: true }),
    server.app.get(FilesService).publish(c.workspaceId, c.userId, v.id, p.revision),
   ]);
   assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
   if (results[1]!.status === 'rejected') { const fresh = await db.project.findUniqueOrThrow({ where: { id: c.projectId } }); await server.app.get(FilesService).publish(c.workspaceId, c.userId, v.id, fresh.revision); }
   assert.equal((await service.guest(c.req, v.id)).approval, null);
   await assert.rejects(service.create(c.req, randomUUID(), { versionId: c.versionId, confirmed: true }));
  });
  await t.test('comentário concorrente à aprovação é anterior a ela ou bloqueado', async () => {
   const c = await account(1);
   const results = await Promise.allSettled([
    service.create(c.req, randomUUID(), { versionId: c.versionId, confirmed: true }),
    server.app.get(CommentsService).create(c.req, { assetId: c.asset.id, clientRequestId: randomUUID(), body: 'Antes de aprovar', anchor: { kind: 'GENERAL' } }),
   ]);
   assert.equal(results[0]!.status, 'fulfilled');
   assert.equal((await server.app.get(CommentsService).guest(c.req, c.asset.id, {})).canComment, false);
   if (results[1]!.status === 'fulfilled') {
    const approval = await db.approval.findUniqueOrThrow({ where: { versionId: c.versionId } });
    const comment = await db.comment.findFirstOrThrow({ where: { versionId: c.versionId } }); assert.ok(comment.createdAt <= approval.createdAt);
   }
  });
  await t.test('limite de tentativas é atômico e mantém replay já registrado', async () => {
   const saved = await db.approval.findUniqueOrThrow({ where: { versionId: a.versionId } });
   const count = await db.approvalRequest.count({ where: { guestSessionId: a.session.id } });
   await db.approvalRequest.createMany({ data: Array.from({ length: 99 - count }, () => ({ guestSessionId: a.session.id, requestKey: randomUUID(), payloadHash: '0'.repeat(64), approvalId: saved.id })) });
   const results = await Promise.allSettled([1, 2].map(() => service.create(a.req, randomUUID(), { versionId: a.versionId, confirmed: true })));
   assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
   assert.equal(await db.approvalRequest.count({ where: { guestSessionId: a.session.id } }), 100);
   assert.equal((await service.create(a.req, key, input)).versionId, input.versionId);
  });
  await t.test('email alterado, expiração, revogação e arquivamento bloqueiam acesso', async () => {
   await db.client.update({ where: { id: a.clientId }, data: { email: 'changed@example.com' } }); await assert.rejects(service.guest(a.req, a.versionId));
   await db.client.update({ where: { id: a.clientId }, data: { email: 'client@example.com' } });
   await db.guestSession.update({ where: { id: a.session.id }, data: { createdAt: new Date(Date.now() - 7200000), expiresAt: new Date(Date.now() - 3600000) } }); await assert.rejects(service.create(a.req, randomUUID(), { versionId: a.versionId, confirmed: true }));
   await db.guestSession.update({ where: { id: a.session.id }, data: { expiresAt: new Date(Date.now() + 3600000), revokedAt: new Date() } }); await assert.rejects(service.guest(a.req, a.versionId));
   await db.guestSession.update({ where: { id: a.session.id }, data: { revokedAt: null } });
   await db.project.update({ where: { id: a.projectId }, data: { status: 'ARCHIVED' } }); await assert.rejects(service.guest(a.req, a.versionId));
   assert.ok((await service.creator(a.workspaceId, a.versionId)).approval);
  });
 } finally { await server.close(); }
});
