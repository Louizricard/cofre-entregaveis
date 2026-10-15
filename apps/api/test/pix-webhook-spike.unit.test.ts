import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createPixReceiver } from '../src/pix-receiver.js';
import { createPixWebhookHandler, pixWebhookFileStore } from '../src/pix-webhook-spike.js';

const secret = 'synthetic-webhook-secret-only';
const settings = { accessToken: 'synthetic-token-only', userId: '123', applicationId: '456' };
const attempt = { key: '00000000-0000-0000-0000-000000000000', reference: 'cofre-spike-00000000-0000-0000-0000-000000000000', userId: '123', applicationId: '456', orderId: 'ORDABCDEFGHIJKL' };
const now = 1791979200000;
const payload = { type: 'order', live_mode: false, application_id: '456', user_id: '123', data: { id: attempt.orderId } };
function signature(ts = String(now), requestId = 'request-1', id = attempt.orderId) {
 return `ts=${ts},v1=${createHmac('sha256', secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest('hex')}`;
}
const order = () => ({ id: attempt.orderId, user_id: 123, integration_data: { application_id: 456 }, external_reference: attempt.reference, type: 'online', country_code: 'BRA', total_amount: '50.00', live_mode: false, status: 'processed', status_detail: 'accredited', transactions: { payments: [{ amount: '50.00', status: 'processed', status_detail: 'accredited', payment_method: { id: 'pix', type: 'bank_transfer' } }] } });
async function fixture(t: TestContext) {
 const dir = await mkdtemp(join(tmpdir(), 'cofre-pix-webhook-'));
 t.after(() => rm(dir, { recursive: true, force: true }));
 const path = join(dir, 'inbox.json'); let calls = 0;
 let response = order(); let fail = false; let hold: Promise<void> | undefined;
 const fetcher: typeof fetch = async (url, init) => {
  calls++; assert.equal(url, 'https://api.mercadopago.com/v1/orders/' + attempt.orderId);
  assert.equal(init?.method, 'GET'); assert.equal(init?.redirect, 'error'); assert.equal(init?.body, undefined);
  if (hold) await hold;
  if (fail) throw new Error('private provider response');
  return Response.json(response);
 };
 const server = () => createPixReceiver(createPixWebhookHandler({ secret, settings, attempt, store: pixWebhookFileStore(path), fetcher, now: () => now }));
 const post = (app = server(), sig = signature(), requestId = 'request-1', query = '') => request(app).post(`/webhooks/mercadopago?data.id=${attempt.orderId}${query}`).set('x-request-id', requestId).set('x-signature', sig);
 return { path, server, post, calls: () => calls, setResponse: (value: typeof response) => { response = value; }, fail: (value: boolean) => { fail = value; }, hold: (value: Promise<void>) => { hold = value; } };
}

test('webhook: assinatura válida, GET fixo, evidência sanitizada e replay após reinício', async t => {
 const f = await fixture(t);
 await f.post().send(payload).expect(200, { result: 'SANDBOX_RECONCILED' });
 await f.post(f.server()).send(payload).expect(200, { result: 'DUPLICATE' });
 assert.equal(f.calls(), 1);
 const raw = await readFile(f.path, 'utf8'); const inbox = JSON.parse(raw) as Record<string, unknown>;
 assert.equal(Object.keys(inbox).length, 1);
 assert.ok(raw.includes('"confirmed":true'));
 for (const value of [secret, settings.accessToken, attempt.orderId, attempt.reference, 'request-1']) assert.ok(!raw.includes(value));
});

test('webhook: rejeita assinatura falsa, vencida, futura, duplicada e query ambígua antes do GET', async t => {
 const f = await fixture(t);
 for (const sig of ['ts=1791979200000,v1=' + '0'.repeat(64), signature(String(now - 300001)), signature(String(now + 300001)), signature() + ',ts=1791979200000', 'ts=1791979200000,v1=invalid']) await f.post(undefined, sig).send(payload).expect(401);
 await f.post(undefined, signature(), 'request-1', '&data.id=' + attempt.orderId).send(payload).expect(401);
 await f.post(undefined, signature(), 'request-2').send(payload).expect(401);
 assert.equal(f.calls(), 0);
});

test('webhook: aceita timestamp em segundos e reconcilia nova entrega novamente', async t => {
 const f = await fixture(t);
 await f.post(undefined, signature(String(now / 1000))).send(payload).expect(200);
 await f.post(undefined, signature(String(now), 'request-2'), 'request-2').send(payload).expect(200);
 assert.equal(f.calls(), 2);
});

test('webhook: exige order de teste conhecida e identidade consistente', async t => {
 const f = await fixture(t);
 for (const body of [{ ...payload, live_mode: true }, { ...payload, live_mode: undefined }, { ...payload, type: 'payment' }, { ...payload, data: { id: 'other' } }, { ...payload, user_id: '999' }, { ...payload, application_id: '999' }]) await f.post().send(body).expect(400);
 assert.equal(f.calls(), 0);
});

test('webhook: corpo não quita order divergente; falha de consulta permite retry', async t => {
 const f = await fixture(t);
 f.setResponse({ ...order(), total_amount: '1.00' });
 await f.post().send({ ...payload, status: 'processed', total_amount: '50.00' }).expect(503);
 f.setResponse(order()); f.fail(true);
 await f.post().send(payload).expect(503);
 f.fail(false);
 await f.post().send(payload).expect(200);
 assert.equal(f.calls(), 3);
});

test('webhook: mesma entrega com outro corpo gera conflito sem nova consulta', async t => {
 const f = await fixture(t);
 await f.post().send(payload).expect(200);
 await f.post().send({ ...payload, action: 'order.updated' }).expect(409);
 assert.equal(f.calls(), 1);
});

test('webhook: body limitado e JSON obrigatório', async t => {
 const f = await fixture(t);
 await f.post().send('not-json').expect(415);
 await f.post().set('Content-Type', 'application/json').send('{bad').expect(400);
 await f.post().send({ ...payload, extra: 'x'.repeat(17000) }).expect(413);
 assert.equal(f.calls(), 0);
});

test('webhook: entrega concorrente pede retry e posterior repetição é deduplicada', async t => {
 const f = await fixture(t); const app = f.server();
 let release!: () => void;
 f.hold(new Promise<void>(resolve => { release = resolve; }));
 const pending = f.post(app).send(payload).then(value => value);
 for (let tries = 0; f.calls() === 0 && tries < 100; tries++) await new Promise(resolve => setTimeout(resolve, 5));
 assert.equal(f.calls(), 1);
 await f.post(app).send(payload).expect(503, { result: 'RETRY' });
 release(); assert.equal((await pending).status, 200);
 await f.post(app).send(payload).expect(200, { result: 'DUPLICATE' });
 assert.equal(f.calls(), 1);
});

test('webhook: falha de persistência não confirma recebimento', async () => {
 const app = createPixReceiver(createPixWebhookHandler({ secret, settings, attempt, now: () => now,
  fetcher: async () => Response.json(order()), store: { read: async () => ({}), write: async () => { throw new Error('disk'); } } }));
 await request(app).post('/webhooks/mercadopago?data.id=' + attempt.orderId).set('x-request-id', 'request-1').set('x-signature', signature()).send(payload).expect(503);
});
