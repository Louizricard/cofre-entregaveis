import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { capturePixProviderDiagnostic, type PixProviderDiagnostic } from '../src/pix-provider-diagnostic.js';
import { runPixOrderSpike, PixOrderProviderError } from '../src/pix-order-spike.js';
const accessToken = 'APP_USR-synthetic-private-token';
test('diagnóstico Orders preserva JSON de erro e x-request-id sem reter credenciais/QR', async () => {
 const id = randomUUID();
 const body = { error: 'unprocessable_entity', message: 'rule ' + accessToken, cause: [{ code: 'some_rule', description: 'validation failed' }],
  details: { access_token: accessToken, refresh_token: 'private-refresh', client_secret: 'private-secret', payer: { email: 'private-email' }, qr_code: 'private-qr', [accessToken]: 'Bearer private-header' } };
 const result = await capturePixProviderDiagnostic(Response.json(body, { status: 422, headers: { 'x-request-id': id } }), accessToken, 'POST', '/v1/orders');
 assert.equal(result.httpStatus, 422); assert.equal(result.requestId, id); assert.equal(result.complete, true); assert.equal(result.redacted, true);
 assert.deepEqual((result.body as typeof body).cause, body.cause);
 for (const value of [accessToken, 'private-refresh', 'private-secret', 'private-email', 'private-qr', 'private-header']) assert.ok(!JSON.stringify(result).includes(value));
});
test('diagnóstico Orders limita corpo, rejeita header suspeito e não chama truncamento de captura completa', async () => {
 for (const body of ['x'.repeat(40000), 'not-json']) {
  const result = await capturePixProviderDiagnostic(new Response(body, { status: 422, headers: { 'x-request-id': accessToken } }), accessToken, 'POST', '/v1/orders');
  assert.equal(result.body, null); assert.equal(result.complete, false); assert.equal(result.requestId, null);
 }
});
test('diagnóstico é persistido antes da falha Orders sem consumir resposta duas vezes ou mudar a tentativa', async () => {
 const attempt = { key: randomUUID(), reference: 'cofre-spike-' + randomUUID(), userId: '123', applicationId: '456', orderId: null };
 const key = attempt.key; const diagnostics: PixProviderDiagnostic[] = [];
 await assert.rejects(runPixOrderSpike({ accessToken, userId: '123', applicationId: '456' }, attempt, async () => assert.fail('não fixar ID'), async url =>
  String(url).endsWith('/users/me') ? Response.json({ id: 123, site_id: 'MLB', tags: ['test_user'] }) : Response.json({ error: 'invalid_credentials', cause: [{ code: 4221 }] }, { status: 422, headers: { 'x-request-id': 'request-123' } }), async diagnostic => { diagnostics.push(diagnostic); }),
 (error: unknown) => error instanceof PixOrderProviderError && error.httpStatus === 422 && error.providerError === 'invalid_credentials');
 assert.equal(diagnostics.length, 1); assert.equal(diagnostics[0].requestId, 'request-123'); assert.equal(diagnostics[0].complete, true);
 assert.equal(attempt.key, key); assert.equal(attempt.orderId, null);
});
