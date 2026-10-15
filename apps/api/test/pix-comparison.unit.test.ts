import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPixComparison } from '../src/pix-comparison.js';
const config = { accessToken: 'APP_USR-synthetic-seller-token', userId: '123', applicationId: '456' };
function fixture(failures: (string | null)[], pinned = -1) {
 const calls: string[] = []; const saved: object[] = [];
 const names = ['orders_minimal_fresh', 'orders_automatic_fresh', 'payments_app_usr_fresh'] as const;
 const steps = names.map((name, i) => ({ name, resourceId: () => i === pinned ? 'ORDSYNTHETIC0001' : null,
  session: {
   connect: (input: typeof config) => { assert.deepEqual(input, config); calls.push(name); },
   wait: async () => {}, close: async () => {},
   snapshot: () => ({ phase: failures[i] ? 'failed' : 'awaiting_notification', failure: failures[i] }),
   webhook: async () => ({ status: 200, body: { result: name } }),
  } }));
 const comparison = createPixComparison(steps, async e => { saved.push(e); });
 return { comparison, calls, saved };
}
test('comparison uses one seller session, advances only after deterministic rejection, and stores no token', async () => {
 const f = fixture(['PROVIDER_HTTP_422', 'PROVIDER_HTTP_422', null]);
 f.comparison.connect(config); await f.comparison.wait();
 assert.deepEqual(f.calls, ['orders_minimal_fresh', 'orders_automatic_fresh', 'payments_app_usr_fresh']);
 assert.ok(!JSON.stringify(f.saved).includes(config.accessToken));
 assert.throws(() => f.comparison.connect(config)); await f.comparison.close();
});
test('comparison stops on network, provider 5xx, resource validation, success or obtained resource', async () => {
 for (const failure of ['CONNECTED_PROOF_FAILED', 'PROVIDER_HTTP_500', 'ORDER_APPLICATION_MISMATCH', null]) {
  const f = fixture([failure, 'PROVIDER_HTTP_422', null]);
  f.comparison.connect(config); await f.comparison.wait(); assert.equal(f.calls.length, 1); await f.comparison.close();
 }
 const f = fixture(['PROVIDER_HTTP_422', 'PROVIDER_HTTP_422', null], 0);
 f.comparison.connect(config); await f.comparison.wait(); assert.equal(f.calls.length, 1); await f.comparison.close();
});
test('comparison refuses wrong token family and closing prevents further provider calls', async () => {
 const f = fixture(['PROVIDER_HTTP_422', 'PROVIDER_HTTP_422', null]);
 assert.throws(() => f.comparison.connect({ ...config, accessToken: 'TEST-synthetic-token' }));
 assert.equal(f.calls.length, 0); await f.comparison.close(); assert.throws(() => f.comparison.connect(config));
});
