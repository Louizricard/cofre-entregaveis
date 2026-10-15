import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';
import { loadPixPaymentAttempt, runPixPaymentSpike, validatePixPayment, type PixPaymentAttempt } from '../src/pix-payment-spike.js';
import { createPixPaymentSession, type PaymentEvidence } from '../src/pix-payment-session.js';
import { createPixOAuthAttempt } from '../src/pix-oauth-spike.js';
import { createPixReceiver } from '../src/pix-receiver.js';
import { savePixProofFile } from '../src/pix-connected-spike.js';
import type { PixWebhookStore } from '../src/pix-webhook-spike.js';
const settings = { userId: '123', applicationId: '456', accessToken: 'TEST-synthetic-oauth-access-token' };
const secret = 'synthetic-payments-signing-secret';
const newAttempt = (): PixPaymentAttempt => ({ api: 'payments', userId: '123', applicationId: '456', key: randomUUID(), reference: 'cofre-payment-' + randomUUID(), paymentId: null });
const account = { id: 123, site_id: 'MLB', tags: ['test_user'] };
const payment = (a: PixPaymentAttempt) => ({ id: 123456789, collector_id: 123, application_id: 456, external_reference: a.reference, live_mode: false,
 transaction_amount: 50, currency_id: 'BRL', payment_method_id: 'pix', payment_type_id: 'bank_transfer', status: 'pending', status_detail: 'pending_waiting_transfer', transaction_amount_refunded: 0 });
function fixture(t: TestContext, overrides: { attempt?: PixPaymentAttempt; real?: boolean; lost?: boolean; persistenceFail?: boolean; http?: number } = {}) {
 const a = overrides.attempt ?? newAttempt(); const calls: { url: string; method?: string; body?: string; key?: string }[] = [];
 const evidence: PaymentEvidence[] = []; let inbox: Awaited<ReturnType<PixWebhookStore['read']>> = {};
 let state = payment(a); let lost = overrides.lost;
 const fetcher: typeof fetch = async (url, init) => {
  assert.equal(init?.redirect, 'error'); assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer ' + settings.accessToken);
  calls.push({ url: String(url), method: init?.method, body: init?.body as string | undefined, key: (init!.headers as Record<string, string>)['X-Idempotency-Key'] });
  if (String(url).endsWith('/users/me')) return Response.json(overrides.real ? { ...account, tags: ['normal'] } : account);
  if (overrides.http) return Response.json({ error: 'unprocessable_entity', message: settings.accessToken }, { status: overrides.http });
  if (lost && init?.method === 'POST') { lost = false; throw new Error('lost ' + settings.accessToken); }
  return Response.json(state);
 };
 const session = createPixPaymentSession({ attempt: a, secret, fetcher,
  store: { read: async () => structuredClone(inbox), write: async value => { inbox = structuredClone(value); } },
  saveAttempt: async () => { if (overrides.persistenceFail) throw new Error('disk'); },
  saveEvidence: async value => { evidence.push(value); },
 });
 t.after(() => session.close());
 const post = (options: { requestId?: string; body?: object; badSignature?: boolean; id?: string; oldTimestamp?: boolean } = {}) => {
  const id = options.id ?? a.paymentId!; const requestId = options.requestId ?? 'delivery-1';
  const ts = String(Date.now() - (options.oldTimestamp ? 600000 : 0));
  const signature = createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex');
  return request(createPixReceiver(req => session.webhook(req))).post('/webhooks/mercadopago?data.id=' + id)
   .set('x-request-id', requestId).set('x-signature', `ts=${ts},v1=${options.badSignature ? '0'.repeat(64) : signature}`)
   .send(options.body ?? { type: 'payment', user_id: 123, live_mode: false, data: { id } });
 };
 return { a, calls, session, evidence, post, fetcher, setState: (patch: Partial<typeof state>) => { state = { ...state, ...patch }; } };
}

test('Payments: OAuth sandbox libera token somente após identidade e POST idempotente/GET não provam webhook', async t => {
 const f = fixture(t); let passed = false;
 const oauth = createPixOAuthAttempt({ clientId: '456', clientSecret: 'synthetic-client-secret', sellerId: '123', redirectUri: 'https://cofre.trycloudflare.com/oauth/callback' }, async () => {}, async (url, init) => {
  if (String(url).endsWith('/oauth/token')) {
   assert.equal(JSON.parse(init!.body as string).test_token, true);
   return Response.json({ access_token: settings.accessToken, token_type: 'bearer', user_id: 123, live_mode: false, scope: 'read write offline_access' });
  }
  return f.fetcher(url, init);
 }, Date.now, verified => { passed = true; f.session.connect(verified); });
 await f.post({ id: '123456789' }).expect(503); assert.equal(f.calls.length, 0);
 const state = new URL(oauth.authorizationUrl).searchParams.get('state');
 assert.equal((await oauth.callback('/oauth/callback?state=' + state + '&code=synthetic-code')).status, 200);
 await f.session.wait(); assert.equal(passed, true);
 assert.equal(f.session.snapshot().idempotencyVerified, true); assert.equal(f.session.snapshot().paymentConfirmed, false);
 assert.equal(f.session.snapshot().webhookReconciled, false); assert.equal(f.session.snapshot().phase, 'awaiting_notification');
 const posts = f.calls.filter(c => c.method === 'POST'); assert.equal(posts.length, 2);
 assert.equal(posts[0].key, posts[1].key); assert.equal(posts[0].body, posts[1].body);
 const body = JSON.parse(posts[0].body!); assert.equal(body.application_fee, undefined); assert.equal(body.transaction_amount, 50);
 assert.ok(f.calls.at(-1)!.url.endsWith('/v1/payments/123456789'));
 for (const value of [settings.accessToken, secret]) assert.ok(!JSON.stringify(f.evidence).includes(value));
});
test('Payments: conta normal e identidade divergente não alcançam POST', async t => {
 const f = fixture(t, { real: true }); f.session.connect(settings); await f.session.wait();
 assert.equal(f.calls.length, 1); assert.equal(f.calls[0].method, 'GET'); assert.equal(f.session.snapshot().phase, 'failed');
 assert.throws(() => fixture(t).session.connect({ ...settings, userId: '999' }));
});
test('Payments: recebedor, ambiente, valor, moeda, referência, método e aplicação divergentes são bloqueados', () => {
 const a = newAttempt(); const base = payment(a);
 for (const patch of [{ collector_id: 999 }, { live_mode: true }, { live_mode: undefined }, { transaction_amount: 49.99 }, { currency_id: 'USD' },
  { external_reference: 'other' }, { payment_method_id: 'visa' }, { payment_type_id: 'credit_card' }, { application_id: 999 }, { id: 'ORD0000000001' }, { id: Number.MAX_SAFE_INTEGER + 1 }]) assert.throws(() => validatePixPayment({ ...base, ...patch }, settings, a));
 assert.equal(validatePixPayment({ ...base, status: 'approved', status_detail: 'accredited' }, settings, a).confirmed, true);
 assert.equal(validatePixPayment({ ...base, status: 'approved', status_detail: 'other' }, settings, a).confirmed, false);
 assert.throws(() => validatePixPayment({ ...base, status: 'approved', status_detail: 'accredited', transaction_amount_refunded: 1 }, settings, a));
});
test('Payments: perda da resposta preserva chave/referência; ID conhecido usa GET antes do POST', async t => {
 const a = newAttempt(); const first = fixture(t, { attempt: a, lost: true }); first.session.connect(settings); await first.session.wait();
 assert.equal(a.paymentId, null); const retry = fixture(t, { attempt: a }); retry.session.connect(settings); await retry.session.wait();
 assert.equal(first.calls.find(c => c.method === 'POST')!.body, retry.calls.find(c => c.method === 'POST')!.body);
 assert.equal(first.calls.find(c => c.method === 'POST')!.key, retry.calls.find(c => c.method === 'POST')!.key);
 const known = fixture(t, { attempt: a }); known.session.connect(settings); await known.session.wait();
 assert.deepEqual(known.calls.map(c => c.method), ['GET', 'GET', 'POST', 'GET']);
});
test('Payments: webhook assinado reconcilia GET, deduplica e replay antigo não restaura aprovação após estorno', async t => {
 const f = fixture(t); f.session.connect(settings); await f.session.wait();
 f.setState({ status: 'approved', status_detail: 'accredited' }); const before = f.calls.length;
 await f.post().expect(200); assert.equal(f.session.snapshot().webhookConfirmed, true);
 await f.post().expect(200, { result: 'DUPLICATE' }); assert.equal(f.calls.length, before + 1);
 f.setState({ status: 'refunded', transaction_amount_refunded: 50 });
 await f.post({ requestId: 'delivery-2' }).expect(200); assert.equal(f.session.snapshot().webhookConfirmed, false);
 await f.post().expect(200); assert.equal(f.session.snapshot().webhookConfirmed, false); assert.equal(f.session.snapshot().status, 'refunded');
});
test('Payments: tópico Orders, live mode, recebedor errado, HMAC falso e vencido não consultam pagamento', async t => {
 const f = fixture(t); f.session.connect(settings); await f.session.wait(); const before = f.calls.length;
 await f.post({ badSignature: true }).expect(401); await f.post({ oldTimestamp: true }).expect(401);
 await f.post({ id: '999' }).expect(401);
 for (const body of [{ type: 'order', user_id: 123, live_mode: false }, { type: 'payment', user_id: 123, live_mode: true }, { type: 'payment', user_id: 999, live_mode: false }]) {
  await f.post({ body: { ...body, data: { id: f.a.paymentId } } }).expect(400);
 }
 assert.equal(f.calls.length, before);
});
test('Payments: falha de persistência, HTTP recusado e encerramento mantêm evidência segura', async t => {
 const disk = fixture(t, { persistenceFail: true }); disk.session.connect(settings); await disk.session.wait(); await disk.post().expect(503);
 const refused = fixture(t, { http: 422 }); refused.session.connect(settings); await refused.session.wait();
 assert.equal(refused.session.snapshot().failure, 'PROVIDER_HTTP_422'); assert.equal(refused.session.snapshot().providerError, 'unprocessable_entity');
 assert.equal(refused.calls.filter(call => call.method === 'POST').length, 1);
 assert.ok(!JSON.stringify(refused.evidence).includes(settings.accessToken));
 const closed = fixture(t); await closed.session.close(); assert.throws(() => closed.session.connect(settings)); assert.equal(closed.calls.length, 0);
 await closed.post({ id: '123456789' }).expect(503);
});
test('Payments: arquivo exclusivo separado, tentativa corrompida/Orders nunca é substituída', async t => {
 const dir = await mkdtemp(join(tmpdir(), 'cofre-payments-')); t.after(() => rm(dir, { recursive: true, force: true })); const path = join(dir, 'attempt.json');
 const a = await loadPixPaymentAttempt(path, '123', '456'); assert.deepEqual(await loadPixPaymentAttempt(path, '123', '456'), a);
 a.paymentId = '123456789'; await savePixProofFile(path, a); assert.deepEqual(await loadPixPaymentAttempt(path, '123', '456'), a);
 await assert.rejects(loadPixPaymentAttempt(path, '999', '456')); assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), a);
 await writeFile(path, '{invalid'); await assert.rejects(loadPixPaymentAttempt(path, '123', '456')); assert.equal(await readFile(path, 'utf8'), '{invalid');
 await writeFile(path, JSON.stringify({ ...a, api: 'orders' })); await assert.rejects(loadPixPaymentAttempt(path, '123', '456'));
});
test('Payments: POST repetido com recurso divergente falha sem trocar ID fixado', async () => {
 const a = newAttempt(); let posts = 0;
 await assert.rejects(runPixPaymentSpike(settings, a, async () => {}, async (url, init) => {
  if (String(url).endsWith('/users/me')) return Response.json(account);
  return Response.json({ ...payment(a), id: init?.method === 'POST' && posts++ > 0 ? 999 : 123456789 });
 }));
 assert.equal(a.paymentId, '123456789');
});

test('Payments: HTTP 500 recupera com mesma chave/corpo e não confunde GET com webhook', async () => {
 const a = newAttempt(); const posts: { key: string; body: string }[] = [];
 const result = await runPixPaymentSpike(settings, a, async () => {}, async (url, init) => {
  if (String(url).endsWith('/users/me')) return Response.json(account);
  if (init?.method === 'POST') {
   posts.push({ key: (init.headers as Record<string, string>)['X-Idempotency-Key'], body: init.body as string });
   if (posts.length === 1) return Response.json({ error: 'internal_error' }, { status: 500 });
  }
  return Response.json(payment(a));
 });
 assert.equal(posts.length, 3); assert.deepEqual(posts[0], posts[1]); assert.deepEqual(posts[1], posts[2]);
 assert.equal(result.idempotencyVerified, true); assert.equal(result.confirmed, false);
});

test('Payments: HTTP 5xx persistente para após três envios preservando tentativa e diagnóstico seguro', async () => {
 const a = newAttempt(); const key = a.key; const reference = a.reference; let sends = 0;
 await assert.rejects(runPixPaymentSpike(settings, a, async () => assert.fail('não persistir ID'), async (url, init) => {
  if (String(url).endsWith('/users/me')) return Response.json(account);
  sends++; assert.equal((init!.headers as Record<string,string>)['X-Idempotency-Key'], key);
  return Response.json({ error: 'internal_error', message: settings.accessToken }, { status: 500 });
 }), (error: unknown) => {
  assert.equal((error as { httpStatus: number }).httpStatus, 500);
  assert.equal((error as { providerError: string }).providerError, 'internal_error');
  assert.ok(!JSON.stringify(error).includes(settings.accessToken)); return true;
 });
 assert.equal(sends, 3); assert.equal(a.paymentId, null); assert.equal(a.reference, reference); assert.equal(a.key, key);
});
test('Payments error capture preserves request id and refuses to hide a diagnostic disk failure', async () => {
 const a = newAttempt();
 const fetcher: typeof fetch = async url => String(url).endsWith('/users/me') ? Response.json(account) : Response.json({ error: 'bad_request', message: settings.accessToken }, { status: 400, headers: { 'x-request-id': 'payment-error-id' } });
 await assert.rejects(runPixPaymentSpike(settings, a, async () => {}, fetcher, async d => {
  assert.equal(d.requestId, 'payment-error-id'); assert.equal(d.httpStatus, 400);
  assert.ok(!JSON.stringify(d).includes(settings.accessToken)); throw new Error('diagnostic disk failure');
 }), /diagnostic disk failure/);
 assert.equal(a.paymentId, null);
});
