import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createPixReceiver } from '../src/pix-receiver.js';
test('receptor isolado: health neutro, sem cookies, CORS ou dados do produto', async () => {
 const r = await request(createPixReceiver()).get('/health').expect(200);
 assert.deepEqual(r.body, { service: 'cofre-pix-isolated-receiver-v1', mode: 'transport-only', oauthReady: false, webhookReady: false });
 assert.equal(r.headers['cache-control'], 'no-store'); assert.equal(r.headers['referrer-policy'], 'no-referrer');
 assert.equal(r.headers['set-cookie'], undefined); assert.equal(r.headers['access-control-allow-origin'], undefined);
});
test('receptor isolado: callback não aceita nem reflete códigos antes da configuração', async () => {
 const r = await request(createPixReceiver()).get('/oauth/callback?code=private-code&state=private-state').expect(503);
 assert.equal(r.body.error, 'OAUTH_NOT_CONFIGURED'); assert.ok(!JSON.stringify(r.body).includes('private'));
});
test('receptor isolado: webhook não confirma recebimento nem reflete payload sem configuração', async () => {
 const r = await request(createPixReceiver()).post('/webhooks/mercadopago').send({ private: 'secret', type: 'order', data: { id: 'test' } }).expect(503);
 assert.equal(r.body.error, 'WEBHOOK_NOT_CONFIGURED'); assert.ok(!JSON.stringify(r.body).includes('secret'));
});
test('receptor isolado: arquivos, endpoints do produto e caminhos codificados não são servidos', async () => {
 for (const path of ['/', '/.env', '/api/v1/ready', '/api/v1/auth/me', '/uploads/test', '/%2e%2e/.env', '/oauth/start', '/webhooks/mercadopago']) {
  await request(createPixReceiver()).get(path).expect(404);
 }
 await request(createPixReceiver()).post('/health').send({}).expect(404);
 await request(createPixReceiver()).post('/oauth/callback').send({}).expect(404);
});
