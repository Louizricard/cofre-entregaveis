import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createConnectedPixSession, loadConnectedPixAttempt, savePixProofFile, type ConnectedPixEvidence } from '../src/pix-connected-spike.js';
import { createPixOAuthAttempt } from '../src/pix-oauth-spike.js';
import { createPixReceiver } from '../src/pix-receiver.js';
import type { PixOrderAttempt } from '../src/pix-order-spike.js';
import type { PixWebhookStore } from '../src/pix-webhook-spike.js';
const secret = 'synthetic-connected-webhook-secret';
const settings = { accessToken: 'synthetic-verified-oauth-token', userId: '123', applicationId: '456' };
const oauthSettings = { clientId: '456', clientSecret: 'synthetic-client-secret', sellerId: '123', redirectUri: 'https://cofre-spike.trycloudflare.com/oauth/callback' };
const newAttempt = (): PixOrderAttempt => ({ key: randomUUID(), reference: 'cofre-spike-' + randomUUID(), userId: '123', applicationId: '456', orderId: null });
function order(a: PixOrderAttempt) { return { id: 'ORDCONNECTED0001', user_id: 123, integration_data: { application_id: 456 }, external_reference: a.reference,
 type: 'online', country_code: 'BRA', currency_id: 'BRL', total_amount: '50.00', live_mode: false, status: 'processed', status_detail: 'accredited',
 transactions: { payments: [{ amount: '50.00', status: 'processed', status_detail: 'accredited', payment_method: { id: 'pix', type: 'bank_transfer' } }] } }; }
function fixture(t: TestContext, a = newAttempt(), overrides: { realAccount?: boolean; lostPost?: boolean; providerStatus?: number; otherApplication?: boolean; persistenceFailure?: boolean } = {}) {
 let inbox: Awaited<ReturnType<PixWebhookStore['read']>> = {}; let postCount = 0;
 const evidence: ConnectedPixEvidence[] = []; const saves: PixOrderAttempt[] = [];
 const calls: { url: string; method: string; key?: string; body?: string }[] = [];
 const fetcher: typeof fetch = async (url, init) => {
  assert.equal(init?.redirect, 'error');
  const headers = init?.headers as Record<string, string>;
  assert.equal(headers.Authorization, 'Bearer ' + settings.accessToken);
  calls.push({ url: String(url), method: init!.method!, key: headers['X-Idempotency-Key'], body: init?.body as string | undefined });
  if (String(url).endsWith('/users/me')) return Response.json({ id: 123, site_id: 'MLB', tags: [overrides.realAccount ? 'normal' : 'test_user'] });
  if (overrides.providerStatus) return Response.json({ error: 'private-payload-do-not-log' }, { status: overrides.providerStatus });
  if (init?.method === 'POST' && overrides.lostPost && postCount++ === 0) throw new Error('lost reply ' + settings.accessToken);
  return Response.json(overrides.otherApplication ? { ...order(a), integration_data: { application_id: 789 } } : order(a));
 };
 const session = createConnectedPixSession({ attempt: a, secret, fetcher, maxPolls: 0,
  store: { read: async () => structuredClone(inbox), write: async value => { inbox = structuredClone(value); } },
  saveAttempt: async value => { if (overrides.persistenceFailure) throw new Error('disk'); saves.push({ ...value }); },
  saveEvidence: async value => { evidence.push(value); },
 });
 t.after(() => session.close());
 const post = () => {
  const ts = String(Date.now()); const id = a.orderId!;
  const signature = createHmac('sha256', secret).update(`id:${id};request-id:delivery-1;ts:${ts};`).digest('hex');
  return request(createPixReceiver(req => session.webhook(req))).post('/webhooks/mercadopago?data.id=' + id)
   .set('x-request-id', 'delivery-1').set('x-signature', `ts=${ts},v1=${signature}`)
   .send({ type: 'order', live_mode: false, user_id: 123, application_id: 456, data: { id } });
 };
 return { session, attempt: a, fetcher, evidence, calls, saves, post };
}
test('Pix conectado: fica fechado antes do OAuth, usa só token verificado e distingue GET de webhook', async t => {
 const f = fixture(t);
 await request(createPixReceiver(req => f.session.webhook(req))).post('/webhooks/mercadopago').send({}).expect(503);
 assert.equal(f.calls.length, 0);
 f.session.connect(settings); await f.session.wait();
 assert.equal(f.session.snapshot().oauthSellerVerified, true);
 assert.equal(f.session.snapshot().orderConfirmed, true); assert.equal(f.session.snapshot().idempotencyVerified, true);
 assert.equal(f.session.snapshot().webhookConfirmed, false); assert.equal(f.session.snapshot().phase, 'awaiting_notification');
 const posts = f.calls.filter(c => c.method === 'POST'); assert.equal(posts.length, 2); assert.equal(posts[0].key, posts[1].key); assert.equal(posts[0].body, posts[1].body);
 assert.equal(JSON.parse(posts[0].body!).payer.first_name, 'APRO'); assert.equal(JSON.parse(posts[0].body!).total_amount, '50.00');
 assert.equal(f.saves.length, 1);
 for (const value of [settings.accessToken, secret]) assert.ok(!JSON.stringify(f.evidence).includes(value));
});
test('Pix conectado: webhook assinado consulta order, grava evidência e deduplica sem outra consulta', async t => {
 const f = fixture(t); f.session.connect(settings); await f.session.wait();
 const before = f.calls.length;
 await f.post().expect(200, { result: 'SANDBOX_RECONCILED' });
 await f.post().expect(200, { result: 'DUPLICATE' });
 assert.equal(f.calls.length, before + 1); assert.equal(f.calls.at(-1)!.method, 'GET');
 assert.equal(f.session.snapshot().webhookReconciled, true); assert.equal(f.session.snapshot().webhookConfirmed, true);
 assert.equal(f.session.snapshot().duplicateSeen, true); assert.equal(f.session.snapshot().phase, 'webhook_confirmed');
});
test('Pix conectado: falha de rede preserva chave e recuperação não cria referência nova', async t => {
 const a = newAttempt(); const originalKey = a.key; const originalReference = a.reference;
 const first = fixture(t, a, { lostPost: true }); first.session.connect(settings); await first.session.wait();
 assert.equal(first.session.snapshot().phase, 'failed'); assert.equal(a.orderId, null);
 const retry = fixture(t, a); retry.session.connect(settings); await retry.session.wait();
 assert.equal(a.key, originalKey); assert.equal(a.reference, originalReference);
 assert.equal(first.calls.find(c => c.method === 'POST')!.body, retry.calls.find(c => c.method === 'POST')!.body);
 assert.equal(first.calls.find(c => c.method === 'POST')!.key, retry.calls.find(c => c.method === 'POST')!.key);
});
test('Pix conectado: order conhecida é consultada antes do POST idempotente', async t => {
 const a = newAttempt(); a.orderId = 'ORDCONNECTED0001';
 const f = fixture(t, a); f.session.connect(settings); await f.session.wait();
 assert.deepEqual(f.calls.map(c => c.method), ['GET', 'GET', 'POST', 'GET']);
});
test('Pix conectado: conta real é bloqueada antes de POST; HTTP e aplicação divergentes falham sem confirmação', async t => {
 const real = fixture(t, newAttempt(), { realAccount: true }); real.session.connect(settings); await real.session.wait();
 assert.equal(real.calls.length, 1); assert.equal(real.calls[0].method, 'GET'); assert.equal(real.session.snapshot().phase, 'failed');
 const denied = fixture(t, newAttempt(), { providerStatus: 403 }); denied.session.connect(settings); await denied.session.wait();
 assert.equal(denied.session.snapshot().failure, 'PROVIDER_HTTP_403'); assert.equal(denied.session.snapshot().orderConfirmed, false);
 const other = fixture(t, newAttempt(), { otherApplication: true }); other.session.connect(settings); await other.session.wait();
 assert.equal(other.session.snapshot().failure, 'ORDER_APPLICATION_MISMATCH'); assert.equal(other.session.snapshot().observedApplicationId, '789');
 assert.equal(other.session.snapshot().webhookConfirmed, false);
});
test('Pix conectado: falha ao fixar order não habilita webhook; encerramento bloqueia chamadas e reconexão', async t => {
 const f = fixture(t, newAttempt(), { persistenceFailure: true }); f.session.connect(settings); await f.session.wait();
 assert.equal(f.session.snapshot().phase, 'failed'); await f.post().expect(503);
 const closed = fixture(t); await closed.session.close(); assert.throws(() => closed.session.connect(settings));
 assert.equal(closed.calls.length, 0); await request(createPixReceiver(req => closed.session.webhook(req))).post('/webhooks/mercadopago').send({}).expect(503);
});
test('Pix conectado: tentativa durável exclusiva e arquivo inválido nunca é substituído', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'cofre-connected-')); t.after(() => rm(dir, { recursive: true, force: true }));
 const path = join(dir, 'attempt.json');
 const first = await loadConnectedPixAttempt(path, '123', '456');
 assert.deepEqual(await loadConnectedPixAttempt(path, '123', '456'), first);
 const pinned = { ...first, orderId: 'ORDCONNECTED0001' }; await savePixProofFile(path, pinned);
 assert.deepEqual(await loadConnectedPixAttempt(path, '123', '456'), pinned);
 await assert.rejects(loadConnectedPixAttempt(path, '999', '456')); assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), pinned);
 await writeFile(path, '{invalid'); await assert.rejects(loadConnectedPixAttempt(path, '123', '456')); assert.equal(await readFile(path, 'utf8'), '{invalid');
});
test('Pix conectado: hook OAuth recebe token só após identidade positiva e não recebe refresh token', async t => {
 const f = fixture(t); let connected = 0;
 const oauthFetch: typeof fetch = async (url, init) => String(url).endsWith('/oauth/token')
  ? Response.json({ access_token: settings.accessToken, refresh_token: 'private-refresh-token', token_type: 'bearer', user_id: 123, live_mode: false, scope: 'read write offline_access' })
  : f.fetcher(url, init);
 const oauth = createPixOAuthAttempt(oauthSettings, async () => {}, oauthFetch, Date.now, verified => {
  connected++; assert.deepEqual(Object.keys(verified).sort(), ['accessToken', 'applicationId', 'userId']); f.session.connect(verified);
 });
 const state = new URL(oauth.authorizationUrl).searchParams.get('state');
 assert.equal((await oauth.callback('/oauth/callback?state=' + state + '&code=synthetic-code')).status, 200);
 await f.session.wait(); assert.equal(connected, 1); assert.equal(f.session.snapshot().orderConfirmed, true);
 const denied = createPixOAuthAttempt(oauthSettings, async () => {}, async () => Response.json({ access_token: settings.accessToken, token_type: 'bearer', user_id: 999 }), Date.now, () => { connected++; });
 assert.equal((await denied.callback('/oauth/callback?state=' + new URL(denied.authorizationUrl).searchParams.get('state') + '&code=synthetic-code')).status, 403);
 assert.equal(connected, 1);
});
