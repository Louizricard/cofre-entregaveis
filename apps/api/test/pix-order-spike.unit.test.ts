import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { runPixOrderSpike, validatePixOrder, PixOrderProviderError, type PixOrderAttempt } from '../src/pix-order-spike.js';
const config = { accessToken: 'fake-token-for-tests', userId: '123', applicationId: '456' };
const attempt = (): PixOrderAttempt => ({ key: randomUUID(), reference: 'cofre-spike-' + randomUUID(), userId: '123', applicationId: '456', orderId: null });
const order = (a: PixOrderAttempt) => ({ id: 'ORD0000000000001', type: 'online', user_id: '123', integration_data: { application_id: '456' }, country_code: 'BRA',
 total_amount: '50.00', external_reference: a.reference, status: 'processed', status_detail: 'accredited', transactions: { payments: [
  { amount: '50.00', status: 'processed', status_detail: 'accredited', payment_method: { id: 'pix', type: 'bank_transfer' } },
 ] } });
const response = (value: unknown) => new Response(JSON.stringify(value));

test('separate automatic scenario preserves its body/key on replay while minimal remains unchanged', async () => {
 for (const mode of [undefined, 'automatic'] as const) {
  const a = attempt(); const posts: { body: string; key: string }[] = [];
  await runPixOrderSpike(config, a, async () => {}, async (url, init) => {
   if (String(url).endsWith('/users/me')) return response({ id: 123, site_id: 'MLB', tags: ['test_user'] });
   if (init?.method === 'POST') posts.push({ body: init.body as string, key: (init.headers as Record<string,string>)['X-Idempotency-Key'] });
   return response(order(a));
  }, undefined, mode);
  assert.equal(posts.length, 2); assert.deepEqual(posts[0], posts[1]);
  assert.equal(JSON.parse(posts[0].body).processing_mode, mode);
 }
});
test('spike order: confere conta antes do POST, mantém chave/corpo e consulta ID', async () => {
 const a = attempt(); const calls: { url: string; method: string; key?: string; body?: string }[] = []; let saved = false;
 const fetcher: typeof fetch = async (url, options) => {
  calls.push({ url: String(url), method: options!.method!, key: (options?.headers as Record<string, string>)['X-Idempotency-Key'], body: options?.body as string | undefined });
  assert.equal(options!.redirect, 'error');
  if (String(url).endsWith('/users/me')) return response({ id: 123, site_id: 'MLB', tags: ['test_user'] });
  return response(order(a));
 };
 const result = await runPixOrderSpike(config, a, async () => { saved = true; }, fetcher);
 assert.equal(calls[0]!.method, 'GET'); assert.ok(saved); assert.equal(calls.length, 4);
 assert.equal(calls[1]!.key, a.key); assert.equal(calls[2]!.key, a.key); assert.equal(calls[1]!.body, calls[2]!.body);
 assert.equal(calls[3]!.url, 'https://api.mercadopago.com/v1/orders/' + a.orderId); assert.equal(result.confirmed, true);
 assert.ok(!JSON.stringify(result).includes('qr_code'));
});
test('spike order: conta real é bloqueada sem qualquer POST', async () => {
 let calls = 0;
 const fetcher: typeof fetch = async (_, options) => { calls++; assert.equal(options?.method, 'GET'); return response({ id: 123, site_id: 'MLB', tags: ['normal'] }); };
 await assert.rejects(runPixOrderSpike(config, attempt(), async () => {}, fetcher)); assert.equal(calls, 1);
});
test('spike order: divergência de valor, país, recebedor, aplicação e referência falha', () => {
 const a = attempt(); const base = order(a);
 for (const patch of [{ total_amount: '49.99' }, { country_code: 'ARG' }, { user_id: '321' }, { integration_data: { application_id: 'other' } },
  { external_reference: 'other' }, { live_mode: true }, { currency_id: 'USD' }, { type: 'point' }, { transactions: { payments: [] } }]) assert.throws(() => validatePixOrder({ ...base, ...patch }, config, a));
});
test('spike order: confirmação exige conciliar estados da order e transação', () => {
 const a = attempt(); const base = order(a);
 assert.equal(validatePixOrder({ ...base, status: 'action_required', status_detail: 'waiting_transfer' }, config, a).confirmed, false);
 assert.equal(validatePixOrder({ ...base, transactions: { payments: [{ ...base.transactions.payments[0], status: 'action_required' }] } }, config, a).confirmed, false);
 assert.throws(() => validatePixOrder({ ...base, status: 'approved' }, config, a));
});
test('spike order: ID persistido recupera por GET antes de repetir POST', async () => {
 const a = attempt(); a.orderId = 'ORD0000000000001'; const methods: string[] = [];
 await runPixOrderSpike(config, a, async () => {}, async (url, options) => {
  methods.push(options!.method!); return response(String(url).endsWith('/users/me') ? { id: 123, site_id: 'MLB', tags: ['test_user'] } : order(a));
 });
 assert.deepEqual(methods, ['GET', 'GET', 'POST', 'GET']);
});
test('spike order: tentativa inválida não alcança endpoints de pagamento', async () => {
 const a = attempt(); a.orderId = '../other'; let calls = 0;
 await assert.rejects(runPixOrderSpike(config, a, async () => {}, async () => { calls++; return response({ id: 123, site_id: 'MLB', tags: ['test_user'] }); }));
 assert.equal(calls, 1);
});
test('spike order: falha de rede preserva chave e mensagens não expõem segredo', async () => {
 const a = attempt(); const key = a.key;
 await assert.rejects(runPixOrderSpike(config, a, async () => {}, async (url) => {
  if (String(url).endsWith('/users/me')) return response({ id: 123, site_id: 'MLB', tags: ['test_user'] });
  throw new Error(config.accessToken);
 }), (e: Error) => !e.message.includes(config.accessToken));
 assert.equal(a.key, key); assert.equal(a.orderId, null);
});

test('spike order: diagnóstico HTTP filtra enum sem registrar descrição ou payload sensível', async () => {
 for (const payload of [{ error: 'invalid_credentials', message: config.accessToken }, { errors: [{ code: 'invalid_credentials', message: config.accessToken }] }, { error: config.accessToken, message: 'private' }]) {
  const a = attempt(); const key = a.key;
  await assert.rejects(runPixOrderSpike(config, a, async () => assert.fail('não persistir order'), async url =>
   String(url).endsWith('/users/me') ? response({ id: 123, site_id: 'MLB', tags: ['test_user'] }) : Response.json(payload, { status: 401 })), (error: unknown) => {
    assert.ok(error instanceof PixOrderProviderError); assert.equal(error.httpStatus, 401);
    assert.equal(error.providerError, payload.error === config.accessToken ? null : 'invalid_credentials');
    assert.ok(!JSON.stringify(error).includes(config.accessToken)); return true;
   });
  assert.equal(a.key, key); assert.equal(a.orderId, null);
 }
});
