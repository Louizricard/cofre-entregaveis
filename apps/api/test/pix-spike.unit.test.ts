import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectPixSandbox, pixSpikeSettings } from '../src/pix-spike.js';
const config = { accessToken: 'fake-token-for-tests', userId: '123', applicationId: '456' };
const account = { id: 123, site_id: 'MLB', tags: ['test_user'], email: 'private@example.com' };
const mock = (payload: unknown, status = 200): typeof fetch => async () => new Response(JSON.stringify(payload), { status });
test('spike: aceita configuração explícita e recusa chave vazia/injeção ou IDs inválidos', () => {
 const env = { MP_SPIKE_ACCESS_TOKEN: config.accessToken, MP_SPIKE_USER_ID: config.userId, MP_SPIKE_APPLICATION_ID: config.applicationId };
 assert.deepEqual(pixSpikeSettings(env), config);
 for (const override of [{ MP_SPIKE_ACCESS_TOKEN: '' }, { MP_SPIKE_ACCESS_TOKEN: 'secret\r\nInjected: value' }, { MP_SPIKE_USER_ID: '0' }, { MP_SPIKE_APPLICATION_ID: '../other' }]) assert.throws(() => pixSpikeSettings({ ...env, ...override }));
});
test('spike: consulta somente endpoint oficial por GET, sem redirects nem segredo na URL', async () => {
 let calls = 0;
 const fetcher: typeof fetch = async (url, options) => {
  calls++; assert.equal(url, 'https://api.mercadolibre.com/users/me'); assert.equal(options?.method, 'GET');
  assert.equal(options?.redirect, 'error'); assert.ok(options?.signal); assert.equal(options?.body, undefined);
  assert.equal((options?.headers as Record<string, string>).Authorization, 'Bearer ' + config.accessToken);
  return mock(account)(url, options);
 };
 const result = await inspectPixSandbox(config, fetcher); assert.equal(calls, 1);
 assert.deepEqual(result, { testUserVerified: true, country: 'BR', readOnly: true });
 assert.ok(!JSON.stringify(result).includes(account.email)); assert.ok(!JSON.stringify(result).includes(config.accessToken));
});
test('spike: prefixo da credencial não substitui conferência de usuário de teste', async () => {
 await assert.rejects(inspectPixSandbox({ ...config, accessToken: 'APP_USR-fake-token-for-tests' }, mock({ ...account, tags: ['normal'] })), /não foi confirmada/);
 await assert.rejects(inspectPixSandbox(config, mock({ ...account, tags: null })), /não foi confirmada/);
});
test('spike: usuário divergente ou de outro país é bloqueado', async () => {
 await assert.rejects(inspectPixSandbox(config, mock({ ...account, id: 321 })), /não corresponde/);
 await assert.rejects(inspectPixSandbox(config, mock({ ...account, site_id: 'MLA' })), /não foi confirmada/);
 await inspectPixSandbox(config, mock({ ...account, id: '123' }));
});
test('spike: erros de rede, credencial e JSON não expõem resposta nem token', async () => {
 for (const fetcher of [mock({ error: config.accessToken }, 401), mock(null), mock([]), (async () => new Response('invalid')) as typeof fetch,
  (async () => { throw new Error('sensitive ' + config.accessToken); }) as typeof fetch]) {
  await assert.rejects(inspectPixSandbox(config, fetcher), (error: Error) => !error.message.includes(config.accessToken) && !error.message.includes(account.email));
 }
});
