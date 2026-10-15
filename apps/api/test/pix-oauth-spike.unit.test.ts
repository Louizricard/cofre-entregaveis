import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { createPixOAuthAttempt, pixOAuthSettings, type PixOAuthEvidence } from '../src/pix-oauth-spike.js';
import { createPixReceiver } from '../src/pix-receiver.js';
const settings = { clientId: '456', clientSecret: 'synthetic-client-secret', sellerId: '123', redirectUri: 'https://cofre-spike.trycloudflare.com/oauth/callback' };
const env = { MP_OAUTH_CLIENT_ID: settings.clientId, MP_OAUTH_CLIENT_SECRET: settings.clientSecret, MP_OAUTH_EXPECTED_TEST_SELLER_ID: settings.sellerId, MP_OAUTH_REDIRECT_URI: settings.redirectUri };
const code = 'synthetic-authorization-code';
const token = { user_id: 123, access_token: 'synthetic-access-token', refresh_token: 'synthetic-refresh-token', token_type: 'bearer', live_mode: false, scope: 'read write offline_access' };
const account = { id: 123, site_id: 'MLB', tags: ['test_user'] };
function fixture(overrides: { token?: unknown; account?: unknown; fail?: boolean; status?: number; persistenceFail?: boolean } = {}) {
 const calls: { url: string; init: RequestInit | undefined }[] = []; const evidence: PixOAuthEvidence[] = [];
 const fetcher: typeof fetch = async (url, init) => {
  calls.push({ url: String(url), init });
  if (overrides.fail) throw new Error('private ' + settings.clientSecret);
  return Response.json(url === 'https://api.mercadopago.com/oauth/token' ? overrides.token ?? token : overrides.account ?? account, { status: overrides.status ?? 200 });
 };
 let now = 1000000;
 const attempt = createPixOAuthAttempt(settings, async result => { if (overrides.persistenceFail) throw new Error('disk'); evidence.push(result); }, fetcher, () => now);
 const state = new URL(attempt.authorizationUrl).searchParams.get('state')!;
 return { attempt, state, calls, evidence, callback: '/oauth/callback?state=' + state + '&code=' + code, expire: () => { now += 600000; } };
}
test('OAuth: configuração exige callback HTTPS isolado e IDs/segredo válidos', () => {
 assert.deepEqual(pixOAuthSettings(env), settings);
 for (const override of [{ MP_OAUTH_CLIENT_SECRET: 'bad\r\nvalue' }, { MP_OAUTH_EXPECTED_TEST_SELLER_ID: '' }, { MP_OAUTH_CLIENT_ID: '../456' }, { MP_OAUTH_REDIRECT_URI: 'http://localhost:3000/oauth/callback' }, { MP_OAUTH_REDIRECT_URI: 'https://cofre-spike.trycloudflare.com/oauth/callback?extra=1' }, { MP_OAUTH_REDIRECT_URI: 'https://cofre-spike.trycloudflare.com.attacker.test/oauth/callback' }]) assert.throws(() => pixOAuthSettings({ ...env, ...override }));
});
test('OAuth: state aleatório, PKCE S256 e troca sandbox seguida de identidade autenticada', async () => {
 const f = fixture(); const auth = new URL(f.attempt.authorizationUrl);
 assert.equal(auth.origin + auth.pathname, 'https://auth.mercadopago.com/authorization');
 assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
 assert.equal(auth.searchParams.get('redirect_uri'), settings.redirectUri);
 assert.notEqual(f.state, fixture().state); assert.ok(!f.attempt.authorizationUrl.includes(settings.clientSecret));
 assert.deepEqual(await f.attempt.callback(f.callback), { status: 200, result: 'SANDBOX_SELLER_CONNECTED' });
 assert.equal(f.calls.length, 2);
 assert.equal(f.calls[0].url, 'https://api.mercadopago.com/oauth/token'); assert.equal(f.calls[0].init?.method, 'POST'); assert.equal(f.calls[0].init?.redirect, 'error');
 const body = JSON.parse(f.calls[0].init!.body as string) as Record<string, unknown>;
 assert.equal(body.test_token, true); assert.equal(body.code, code); assert.equal(body.client_secret, settings.clientSecret);
 assert.equal(body.grant_type, 'authorization_code'); assert.equal(body.redirect_uri, settings.redirectUri);
 assert.equal(createHash('sha256').update(String(body.code_verifier)).digest('base64url'), auth.searchParams.get('code_challenge'));
 assert.equal(f.calls[1].url, 'https://api.mercadolibre.com/users/me'); assert.equal(f.calls[1].init?.method, 'GET');
 assert.deepEqual(f.evidence, [{ sandboxSellerVerified: true, stateVerified: true, pkceUsed: true, tokensPersisted: false, readScopeGranted: true, writeScopeGranted: true }]);
 for (const value of [code, settings.clientSecret, token.access_token, token.refresh_token, f.state]) assert.ok(!JSON.stringify(f.evidence).includes(value));
});
test('OAuth: state ausente/incorreto/duplicado, código duplicado e origem divergente não consultam provedor', async () => {
 const f = fixture();
 for (const url of ['/oauth/callback?code=' + code, f.callback.replace(f.state, 'x'.repeat(43)), f.callback + '&state=' + f.state, f.callback + '&code=' + code, 'https://attacker.test' + f.callback, f.callback.replace(code, 'invalid%0Acode')]) assert.equal((await f.attempt.callback(url)).status, 400);
 assert.equal(f.calls.length, 0); assert.equal(f.evidence.length, 0);
});
test('OAuth: expiração e consentimento negado consomem tentativa', async () => {
 const expired = fixture(); expired.expire(); assert.equal((await expired.attempt.callback(expired.callback)).status, 410);
 assert.equal((await expired.attempt.callback(expired.callback)).status, 409);
 const denied = fixture(); assert.equal((await denied.attempt.callback('/oauth/callback?state=' + denied.state + '&error=access_denied')).result, 'AUTHORIZATION_DENIED');
 assert.equal((await denied.attempt.callback(denied.callback)).status, 409); assert.equal(denied.calls.length, 0);
});
test('OAuth: repetição e concorrência não trocam o mesmo código novamente', async () => {
 const f = fixture(); const results = await Promise.all([f.attempt.callback(f.callback), f.attempt.callback(f.callback)]);
 assert.deepEqual(results.map(r => r.status).sort(), [200, 409]); assert.equal(f.calls.length, 2);
 assert.equal((await f.attempt.callback(f.callback)).status, 409);
});
test('OAuth: conta real, recebedor divergente ou live_mode produtivo não produzem evidência', async () => {
 for (const overrides of [{ account: { ...account, tags: ['normal'] } }, { account: { ...account, site_id: 'MLA' } }, { token: { ...token, user_id: 999 } }, { token: { ...token, live_mode: true } }]) {
  const f = fixture(overrides); assert.notEqual((await f.attempt.callback(f.callback)).status, 200); assert.equal(f.evidence.length, 0);
 }
});
test('OAuth: falha de rede/token/persistência não expõe segredo e exige tentativa nova', async () => {
 for (const overrides of [{ fail: true }, { status: 401 }, { token: { ...token, access_token: 'invalid' } }, { persistenceFail: true }]) {
  const f = fixture(overrides); const result = await f.attempt.callback(f.callback); assert.notEqual(result.status, 200);
  for (const value of [code, settings.clientSecret, token.access_token, token.refresh_token]) assert.ok(!JSON.stringify(result).includes(value));
  assert.equal(f.evidence.length, 0); assert.equal((await f.attempt.callback(f.callback)).status, 409);
 }
});
test('OAuth: callback HTTP remove query, não reflete código e não permite iniciar por rota pública', async () => {
 const f = fixture(); const app = createPixReceiver(undefined, f.attempt);
 const reply = await request(app).get(f.callback).expect(303);
 assert.equal(reply.headers.location, '/oauth/complete'); assert.equal(reply.headers['cache-control'], 'no-store');
 assert.ok(!reply.text.includes(code)); assert.ok(!reply.text.includes(f.state));
 await request(app).get('/oauth/start').expect(404);
 await request(app).get(f.callback).expect(303).expect('Location', '/oauth/failed');
 const complete = await request(app).get('/oauth/complete').expect(200); assert.ok(!complete.text.includes('SANDBOX_SELLER_CONNECTED'));
});

test('OAuth: diagnóstico guarda somente HTTP e enum conhecido, nunca descrição ou código sensível', async () => {
 for (const error of ['invalid_grant', 'private-' + settings.clientSecret]) {
  const attempt = createPixOAuthAttempt(settings, async () => { assert.fail('não confirmar'); }, async () => Response.json({ error, error_description: code + ' ' + settings.clientSecret, access_token: token.access_token }, { status: 400 }));
  const state = new URL(attempt.authorizationUrl).searchParams.get('state');
  const result = await attempt.callback('/oauth/callback?state=' + state + '&code=' + code);
  assert.deepEqual(result, { status: 502, result: 'TOKEN_EXCHANGE_FAILED', diagnostic: { httpStatus: 400, providerError: error === 'invalid_grant' ? error : null } });
  for (const value of [code, settings.clientSecret, token.access_token]) assert.ok(!JSON.stringify(result).includes(value));
 }
});

test('OAuth Orders: credencial APP_USR só é entregue após provar vendedor MLB test_user esperado', async () => {
 for (const scenario of ['valid', 'real', 'wrong_id', 'wrong_country', 'test_credential', 'identity_failure'] as const) {
  const calls: string[] = []; let delivered = false; let saved = false;
  const accessToken = scenario === 'test_credential' ? 'TEST-synthetic-access-token' : 'APP_USR-synthetic-access-token';
  const attempt = createPixOAuthAttempt(settings, async () => { saved = true; }, async (url, init) => {
   calls.push(String(url));
   if (String(url).endsWith('/oauth/token')) {
    assert.equal(JSON.parse(init!.body as string).test_token, false);
    return Response.json({ ...token, access_token: accessToken, live_mode: true });
   }
   if (scenario === 'identity_failure') throw new Error(accessToken);
   return Response.json({ id: scenario === 'wrong_id' ? 999 : 123, site_id: scenario === 'wrong_country' ? 'MLA' : 'MLB', tags: [scenario === 'real' ? 'normal' : 'test_user'] });
  }, Date.now, verified => { delivered = true; assert.equal(verified.accessToken, accessToken); }, 'orders_test_user');
  const state = new URL(attempt.authorizationUrl).searchParams.get('state');
  const result = await attempt.callback('/oauth/callback?state=' + state + '&code=' + code);
  assert.equal(result.status === 200, scenario === 'valid');
  assert.equal(delivered, scenario === 'valid'); assert.equal(saved, scenario === 'valid');
  assert.equal(calls.length, scenario === 'test_credential' ? 1 : 2);
  assert.ok(!JSON.stringify(result).includes(accessToken));
 }
});

test('OAuth conectado: scope ausente/parcial não entrega token à cobrança; concessão completa é comprovada sem guardar token', async () => {
 for (const scope of [undefined, 'read', 'write', 'offline_access', 'read write offline_access']) {
  let delivered = false; let saved = false; let calls = 0;
  const attempt = createPixOAuthAttempt(settings, async evidence => { saved = true; assert.equal(evidence.readScopeGranted, true); assert.equal(evidence.writeScopeGranted, true); }, async url => {
   calls++; return Response.json(String(url).endsWith('/oauth/token') ? { ...token, scope } : account);
  }, Date.now, () => { delivered = true; });
  const state = new URL(attempt.authorizationUrl).searchParams.get('state');
  const result = await attempt.callback('/oauth/callback?state=' + state + '&code=' + code);
  assert.equal(result.status === 200, scope === 'read write offline_access');
  assert.equal(delivered, scope === 'read write offline_access'); assert.equal(saved, delivered);
  assert.equal(calls, delivered ? 2 : 1);
  if (!delivered) {
   assert.equal(result.result, 'PAYMENT_SCOPES_REQUIRED');
   assert.equal(result.diagnostic?.stage, 'scope_validation');
   assert.equal(result.diagnostic?.scopeType, scope === undefined ? 'missing' : 'string');
   assert.equal(result.diagnostic?.readScopeGranted, scope === 'read');
   assert.equal(result.diagnostic?.writeScopeGranted, scope === 'write');
   assert.ok(!JSON.stringify(result).includes(token.access_token));
  }
 }
});
test('OAuth scope diagnostics classify unexpected formats without persisting their contents', async () => {
 for (const scope of ['read,write', ['read', 'write'], token.access_token, null]) {
  const attempt = createPixOAuthAttempt(settings, async () => assert.fail('no evidence'), async () => Response.json({ ...token, scope }), Date.now, () => assert.fail('no charge'));
  const state = new URL(attempt.authorizationUrl).searchParams.get('state');
  const result = await attempt.callback('/oauth/callback?state=' + state + '&code=' + code);
  assert.equal(result.result, 'PAYMENT_SCOPES_REQUIRED');
  assert.equal(result.diagnostic?.commaSeparated, scope === 'read,write');
  assert.equal(result.diagnostic?.scopeType, Array.isArray(scope) ? 'array' : scope === null ? 'other' : 'string');
  assert.ok(!JSON.stringify(result).includes(token.access_token));
  assert.ok(!JSON.stringify(result).includes('read,write'));
 }
});
test('OAuth accepts read/write in a long granted scope list and rejects partial name matches', async () => {
 for (const granted of [true, false]) {
  const scope = 'additional_permission '.repeat(100) + (granted ? 'read write offline_access' : 'read_only overwrite offline_access');
  let delivered = false;
  const attempt = createPixOAuthAttempt(settings, async evidence => {
   assert.equal(evidence.readScopeGranted, true); assert.equal(evidence.writeScopeGranted, true);
   assert.ok(!JSON.stringify(evidence).includes('additional_permission'));
  }, async url => Response.json(String(url).endsWith('/oauth/token') ? { ...token, scope } : account), Date.now, () => { delivered = true; });
  const state = new URL(attempt.authorizationUrl).searchParams.get('state');
  const result = await attempt.callback('/oauth/callback?state=' + state + '&code=' + code);
  assert.equal(result.status === 200, granted); assert.equal(delivered, granted);
  if (!granted) assert.equal(result.diagnostic?.scopeLength, scope.length);
 }
});
