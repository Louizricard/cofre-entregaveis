import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { CommentsService } from '../src/comments.service.js';
import { FilesService } from '../src/files.service.js';
import { digest, newToken } from '../src/security.js';
import type { GuestRequest } from '../src/sharing.service.js';
const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || process.env.COFRE_INTEGRATION !== '1') throw new Error('Execute pnpm test:integration.');
const url = new URL(databaseUrl);
if (url.port !== '5433' || url.pathname !== '/cofre_test' || !/^cofre_test_[a-f0-9]{32}$/.test(url.searchParams.get('schema') ?? '')) throw new Error('Banco não isolado.');
test('comentários: identidade, âncoras, isolamento, repetição e histórico', async t => {
 const server = await createApp({ databaseUrl, origin: 'http://localhost:8080', production: false, sessionDays: 7, port: 3000 }, { quiet: true, mailer: null });
 const { db } = server; const http = server.app.getHttpServer(); const service = server.app.get(CommentsService);
 const csrf = await request(http).get('/api/v1/auth/csrf').expect(200);
 const mutate = (path: string, body: object, cookie = '') => request(http).post('/api/v1' + path).set('Origin', 'http://localhost:8080')
  .set('X-CSRF-Token', csrf.body.csrfToken).set('Cookie', [...csrf.headers['set-cookie'] as unknown as string[], cookie]).send(body);
 const get = (path: string, cookie: string) => request(http).get('/api/v1' + path).set('Cookie', cookie);
 async function account(full = false) {
  const r = await mutate('/auth/register', { name: 'QA', email: randomUUID() + '@example.com', password: 'uma-senha-segura-123', workspaceName: 'Comments QA' }).expect(201);
  const cookie = (r.headers['set-cookie'] as unknown as string[]).find(c => c.startsWith('cofre-session='))!.split(';')[0];
  const client = await mutate('/clients', { name: 'QA', email: 'client@example.com' }, cookie).expect(201);
  const project = await mutate('/projects', { clientId: client.body.id, title: 'QA', balanceCents: 0, includedRevisionRounds: 2 }, cookie).expect(201);
  const version = await mutate(`/projects/${project.body.id}/versions`, {}, cookie).expect(201);
  const assets = [];
  for (const mime of full ? ['application/zip', 'application/pdf', 'image/png', 'video/mp4', 'audio/mpeg'] : ['application/zip']) {
   const a = await db.asset.create({ data: { workspaceId: r.body.workspace.id as string, versionId: version.body.id as string, fileName: 'test', mime, sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
   assets.push(a);
   if (mime !== 'application/zip') await db.mediaJob.create({ data: { assetId: a.id, state: 'READY', pages: { create: mime === 'video/mp4' || mime === 'audio/mpeg' ? [
    { number: 1, objectKey: randomUUID(), sizeBytes: 5n, width: mime === 'video/mp4' ? 1280 : 0, height: mime === 'video/mp4' ? 720 : 0, kind: mime === 'video/mp4' ? 'VIDEO' : 'AUDIO', mime: mime === 'video/mp4' ? 'video/mp4' : 'audio/mp4', durationMs: 3000 },
   ] : [1, ...(mime === 'application/pdf' ? [2] : [])].map(number => ({ number, objectKey: randomUUID(), sizeBytes: 5n, width: 100, height: 100 })) } } });
  }
  if (full) await mutate(`/assets/${assets[0]!.id}/manual-preview`, { previewAssetId: assets[1]!.id }, cookie).expect(200);
  const p = await db.project.findUniqueOrThrow({ where: { id: project.body.id as string } });
  await mutate(`/versions/${version.body.id}/publish`, { expectedProjectRevision: p.revision }, cookie).expect(200);
  const share = await db.shareLink.create({ data: { workspaceId: p.workspaceId, projectId: p.id, tokenHash: digest(newToken()), expiresAt: new Date(Date.now() + 86400000) } });
  const token = newToken(); const session = await db.guestSession.create({ data: { shareId: share.id, tokenHash: digest(token), expiresAt: new Date(Date.now() + 3600000), verifiedAt: new Date(), verifiedEmail: 'client@example.com' } });
  return { cookie, guestCookie: 'cofre-guest=' + token, req: { cookies: { 'cofre-guest': token } } as unknown as GuestRequest, session, share, assets, versionId: version.body.id as string, projectId: p.id, workspaceId: p.workspaceId, clientId: client.body.id as string, userId: r.body.user.id as string };
 }
 try {
  const a = await account(true); const b = await account(); const [zip, pdf, image, video, audio] = a.assets;
  const input = (assetId = zip!.id) => ({ assetId, clientRequestId: randomUUID(), body: 'Ajustar a entrega', anchor: { kind: 'GENERAL' } });
  await t.test('exige sessão, CSRF e identidade ainda correspondente ao cliente', async () => {
   await mutate('/guest/comments', input()).expect(401);
   await request(http).post('/api/v1/guest/comments').set('Cookie', a.guestCookie).send(input()).expect(403);
   await db.guestSession.update({ where: { id: a.session.id }, data: { verifiedAt: null, verifiedEmail: null } });
   await get(`/guest/assets/${zip!.id}/comments`, a.guestCookie).expect(403); await mutate('/guest/comments', input(), a.guestCookie).expect(403);
   await db.guestSession.update({ where: { id: a.session.id }, data: { verifiedAt: new Date(), verifiedEmail: 'client@example.com' } });
  });
  await t.test('comentário geral guarda auditoria e não expõe e-mail, sessão ou chaves', async () => {
   const r = await mutate('/guest/comments', { ...input(), body: '  <script>alert("texto")</script>\nPedido real de teste  ' }, a.guestCookie).expect(201);
   assert.ok((r.body.body as string).startsWith('<script>')); assert.equal(r.body.anchor.kind, 'GENERAL');
   const stored = await db.comment.findUniqueOrThrow({ where: { id: r.body.id as string } }); assert.equal(stored.authorEmail, 'client@example.com'); assert.equal(stored.versionId, a.versionId);
   for (const value of ['client@example.com', 'authorEmail', 'guestSessionId', 'objectKey', a.assets[0]!.objectKey]) assert.ok(!JSON.stringify(r.body).includes(value));
   const creator = await get(`/assets/${zip!.id}/comments`, a.cookie).expect(200); assert.equal(creator.body.canComment, false); assert.equal(creator.body.items.length, 1);
  });
  await t.test('mesma tentativa concorrente cria uma vez; payload diferente dá conflito', async () => {
   const dto = input(); const results = await Promise.all([service.create(a.req, dto), service.create(a.req, dto)]);
   assert.equal(results[0]!.id, results[1]!.id); assert.equal(await db.comment.count({ where: { clientRequestId: dto.clientRequestId } }), 1);
   await mutate('/guest/comments', { ...dto, body: 'outro texto' }, a.guestCookie).expect(409);
  });
  await t.test('ponto em imagem/PDF, instante de vídeo/áudio e ZIP com PDF são aceitos', async () => {
   for (const [asset, anchor] of [
    [image!, { kind: 'IMAGE_POINT', x: 0, y: 1 }], [pdf!, { kind: 'PDF_POINT', page: 2, x: 0.25, y: 0.5 }],
    [zip!, { kind: 'PDF_POINT', page: 1, x: 0.5, y: 0.5 }], [video!, { kind: 'TIME', timeMs: 3000 }], [audio!, { kind: 'TIME', timeMs: 0 }],
   ] as const) await mutate('/guest/comments', { ...input(asset.id), anchor }, a.guestCookie).expect(201);
  });
  await t.test('rejeita âncoras ambíguas, inválidas ou além da prévia e corpos vazios', async () => {
   for (const dto of [
    { ...input(), anchor: null }, { ...input(), anchor: { kind: 'GENERAL', x: 0 } }, { ...input(), anchor: { kind: 'IMAGE_POINT', x: 0, y: 0 } },
    { ...input(pdf!.id), anchor: { kind: 'PDF_POINT', page: 3, x: 0, y: 0 } }, { ...input(video!.id), anchor: { kind: 'TIME', timeMs: 3001 } },
    { ...input(image!.id), anchor: { kind: 'IMAGE_POINT', x: -1, y: 0 } }, { ...input(video!.id), anchor: { kind: 'TIME' } },
    { ...input(), body: '   ' }, { ...input(), body: 'x'.repeat(4001) }, { ...input(), body: 'texto\u0000' },
   ]) await mutate('/guest/comments', dto, a.guestCookie).expect(400);
  });
  await t.test('isola arquivo, projeto, workspace e cursor; rascunho é oculto', async () => {
   await mutate('/guest/comments', input(b.assets[0]!.id), a.guestCookie).expect(404);
   await get(`/assets/${zip!.id}/comments`, b.cookie).expect(404); await get(`/guest/assets/${zip!.id}/comments`, b.guestCookie).expect(404);
   const another = await db.project.create({ data: { workspaceId: a.workspaceId, clientId: a.clientId, title: 'Privado', balanceCents: 0, includedRevisionRounds: 0 } });
   const v = await db.projectVersion.create({ data: { projectId: another.id, workspaceId: a.workspaceId, number: 1, state: 'PUBLISHED', publishedAt: new Date(), publishedById: a.userId } });
   const hidden = await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: v.id, fileName: 'hidden.zip', mime: 'application/zip', sizeBytes: 1n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
   await mutate('/guest/comments', input(hidden.id), a.guestCookie).expect(404);
   const draft = await db.projectVersion.create({ data: { projectId: a.projectId, workspaceId: a.workspaceId, number: 2 } });
   const draftAsset = await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: draft.id, fileName: 'draft.zip', mime: 'application/zip', sizeBytes: 1n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
   await mutate('/guest/comments', input(draftAsset.id), a.guestCookie).expect(404);
   const otherComment = await service.create(b.req, input(b.assets[0]!.id));
   await get(`/guest/assets/${zip!.id}/comments?cursor=${otherComment.id}`, a.guestCookie).expect(404);
  });
  await t.test('paginação cronológica não repete registros e expiração de segurança bloqueia escrita', async () => {
   const first = await get(`/guest/assets/${zip!.id}/comments?limit=1`, a.guestCookie).expect(200);
   const second = await get(`/guest/assets/${zip!.id}/comments?limit=1&cursor=${first.body.nextCursor}`, a.guestCookie).expect(200); assert.notEqual(first.body.items[0].id, second.body.items[0].id);
   await db.asset.update({ where: { id: pdf!.id }, data: { scannedAt: new Date(0) } });
   const list = await get(`/guest/assets/${zip!.id}/comments`, a.guestCookie).expect(200); assert.equal(list.body.canComment, false);
   await mutate('/guest/comments', input(), a.guestCookie).expect(409);
   await db.asset.update({ where: { id: pdf!.id }, data: { scannedAt: new Date() } });
  });
  await t.test('limite de duzentos comentários por arquivo permanece correto na concorrência', async () => {
   const count = await db.comment.count({ where: { assetId: image!.id } });
   await db.comment.createMany({ data: Array.from({ length: 199 - count }, () => ({ workspaceId: a.workspaceId, versionId: a.versionId, assetId: image!.id, guestSessionId: a.session.id, clientRequestId: randomUUID(), payloadHash: '0'.repeat(64), authorEmail: 'client@example.com', body: 'limite', anchorKind: 'GENERAL' })) });
   const results = await Promise.allSettled([service.create(a.req, input(image!.id)), service.create(a.req, input(image!.id))]);
   assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(await db.comment.count({ where: { assetId: image!.id } }), 200);
  });
  await t.test('publicação concorrente não permite comentário novo na versão superada', async () => {
   const v = await mutate(`/projects/${a.projectId}/versions`, {}, a.cookie).expect(201);
   await db.asset.create({ data: { workspaceId: a.workspaceId, versionId: v.body.id as string, fileName: 'new.zip', mime: 'application/zip', sizeBytes: 10n, objectKey: randomUUID(), status: 'READY', expiresAt: new Date(), scanStatus: 'CLEAN', scannedAt: new Date(), scanDefinitions: 'test', scanSha256: '0'.repeat(64) } });
   const project = await db.project.findUniqueOrThrow({ where: { id: a.projectId } });
   const results = await Promise.allSettled([service.create(a.req, input()), server.app.get(FilesService).publish(a.workspaceId, a.userId, v.body.id as string, project.revision)]);
   assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
   if (results[1]!.status === 'rejected') { const current = await db.project.findUniqueOrThrow({ where: { id: a.projectId } }); await server.app.get(FilesService).publish(a.workspaceId, a.userId, v.body.id as string, current.revision); }
   await mutate('/guest/comments', input(), a.guestCookie).expect(409);
   const history = await get(`/guest/assets/${zip!.id}/comments`, a.guestCookie).expect(200); assert.equal(history.body.canComment, false); assert.ok(history.body.items.length);
  });
  await t.test('e-mail alterado, sessão revogada e arquivamento bloqueiam convidados; criador consulta histórico', async () => {
   await db.client.update({ where: { id: a.clientId }, data: { email: 'changed@example.com' } });
   await get(`/guest/assets/${zip!.id}/comments`, a.guestCookie).expect(403);
   await db.client.update({ where: { id: a.clientId }, data: { email: 'client@example.com' } });
   await db.guestSession.update({ where: { id: a.session.id }, data: { revokedAt: new Date() } });
   await get(`/guest/assets/${zip!.id}/comments`, a.guestCookie).expect(401);
   await db.project.update({ where: { id: a.projectId }, data: { status: 'ARCHIVED' } });
   await get(`/assets/${zip!.id}/comments`, a.cookie).expect(200);
   await db.project.update({ where: { id: b.projectId }, data: { status: 'ARCHIVED' } });
   await get(`/guest/assets/${b.assets[0]!.id}/comments`, b.guestCookie).expect(401);
  });
 } finally { await server.close(); }
});
