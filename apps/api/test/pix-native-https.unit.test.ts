import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { request } from 'node:https';
import { createPixNativeHttps } from '../src/pix-native-https.js';

function fixture(status: number, payload: string) {
 let calls = 0; let sent: unknown; let length: unknown;
 const transport = ((_url: unknown, options: { headers: Record<string, string>; signal?: AbortSignal }, callback: (res: unknown) => void) => {
  calls++;
  const req = new EventEmitter() as EventEmitter & { setTimeout: () => void; end: (body: unknown) => void; destroy: () => void };
  req.setTimeout = () => undefined;
  req.destroy = () => { req.emit('error', new Error('private transport details')); };
  options.signal?.addEventListener('abort', req.destroy, { once: true });
  req.end = body => {
   sent = body; length = options.headers['content-length'];
   const res = Object.assign(new PassThrough(), { statusCode: status, headers: { 'content-type': 'application/json', 'x-request-id': 'diagnostic-id' } });
   callback(res); res.end(payload);
  };
  return req;
 }) as unknown as typeof request;
 return { client: createPixNativeHttps(transport), inspect: () => ({ calls, sent, length }) };
}

test('native transport preserves provider errors and request id for local capture', async () => {
 const mock = fixture(422, '{"errors":[{"code":"unprocessable_content"}]}');
 const body = '{"payer":"sintético"}';
 const response = await mock.client('https://api.mercadopago.com/v1/orders', { method: 'POST', body });
 assert.equal(response.status, 422);
 assert.equal(response.headers.get('x-request-id'), 'diagnostic-id');
 assert.deepEqual(await response.json(), { errors: [{ code: 'unprocessable_content' }] });
 assert.deepEqual(mock.inspect(), { calls: 1, sent: body, length: String(Buffer.byteLength(body)) });
});

test('native transport refuses destinations and redirects without forwarding tokens', async () => {
 const mock = fixture(302, '{}');
 for (const url of ['http://api.mercadopago.com/v1/orders', 'https://evil.example/v1/orders', 'https://api.mercadopago.com/v1/orders?token=x', 'https://user@api.mercadopago.com/v1/orders', 'https://api.mercadopago.com/oauth/token']) {
  await assert.rejects(mock.client(url, { method: 'POST', headers: { Authorization: 'Bearer private' } }), /PIX_NATIVE_DESTINATION/);
 }
 assert.equal(mock.inspect().calls, 0);
 await assert.rejects(mock.client('https://api.mercadopago.com/v1/orders', { method: 'POST' }), /PIX_NATIVE_STATUS/);
 assert.equal(mock.inspect().calls, 1);
});

test('native transport bounds bodies and honors pre-aborted requests', async () => {
 const mock = fixture(200, 'x'.repeat(65537));
 await assert.rejects(mock.client('https://api.mercadopago.com/v1/orders', { method: 'POST', body: 'x'.repeat(32769) }), /PIX_NATIVE_BODY/);
 await assert.rejects(mock.client('https://api.mercadolibre.com/users/me', { signal: AbortSignal.abort() }), /PIX_NATIVE_ABORTED/);
 assert.equal(mock.inspect().calls, 0);
 await assert.rejects(mock.client('https://api.mercadolibre.com/users/me'), /PIX_NATIVE_RESPONSE_LIMIT/);
});
