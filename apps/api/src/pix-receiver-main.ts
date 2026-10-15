import { createPixReceiver } from './pix-receiver.js';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { readFile, writeFile } from 'node:fs/promises';
import { inspectPixSandbox, pixSpikeSettings } from './pix-spike.js';
import type { PixOrderAttempt } from './pix-order-spike.js';
import { createPixWebhookHandler, pixWebhookFileStore, queryPixOrder, type PixWebhookHandler } from './pix-webhook-spike.js';
import { createPixOAuthAttempt, pixOAuthSettings, type PixOAuthAttempt } from './pix-oauth-spike.js';
import { createConnectedPixSession, loadConnectedPixAttempt, savePixProofFile } from './pix-connected-spike.js';
import { loadPixPaymentAttempt } from './pix-payment-spike.js';
import { createPixPaymentSession } from './pix-payment-session.js';
import { createPixNativeHttps } from './pix-native-https.js';
import { createPixComparison } from './pix-comparison.js';
const local = (name: string) => fileURLToPath(new URL('../../../../.local/' + name, import.meta.url));
// Only isolated local files; never fall back to credentials from the product environment.
const spikeConfig = config({ path: local('pix-spike.env'), quiet: true }).parsed ?? {};
const oauthConfig = config({ path: local('pix-oauth.env'), quiet: true }).parsed ?? {};
let webhook: PixWebhookHandler | undefined;
let oauth: PixOAuthAttempt | undefined;
let connected: ReturnType<typeof createConnectedPixSession> | undefined;
let payments: ReturnType<typeof createPixPaymentSession> | undefined;
let comparison: ReturnType<typeof createPixComparison> | undefined;
async function preserveEvidence(name: string) {
 try { const old = await readFile(local(name)); await writeFile(local(name + '.previous.' + Date.now() + '.json'), old, { flag: 'wx', mode: 0o600 }); }
 catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
}
try {
 if (oauthConfig.MP_OAUTH_COMPARE === '1' && (oauthConfig.MP_OAUTH_PIX_ENABLED !== '1' || oauthConfig.MP_OAUTH_NATIVE_ORDERS !== '1')) throw new Error('Comparação exige Orders nativo isolado.');
 if (oauthConfig.MP_OAUTH_PAYMENT_SCENARIO && oauthConfig.MP_OAUTH_PAYMENT_SCENARIO !== 'sandbox_fresh') throw new Error('Cenário Payments desconhecido.');
 if (oauthConfig.MP_OAUTH_NATIVE_ORDERS === '1' && oauthConfig.MP_OAUTH_PIX_ENABLED !== '1') throw new Error('HTTPS nativo exige Orders isolado.');
 if (oauthConfig.MP_OAUTH_PAYMENT_ENABLED === '1' && oauthConfig.MP_OAUTH_PIX_ENABLED === '1') throw new Error('Selecione apenas uma API para o ensaio.');
 if (oauthConfig.MP_OAUTH_COMPARE === '1') {
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(spikeConfig.MP_SPIKE_WEBHOOK_SECRET ?? '')) throw new Error('Assinatura não configurada.');
  const orderSteps = [];
  for (const name of ['orders_minimal_fresh', 'orders_automatic_fresh'] as const) {
   const prefix = 'pix-comparison-' + name;
   const attempt = await loadConnectedPixAttempt(local(prefix + '-attempt.json'), oauthConfig.MP_OAUTH_EXPECTED_TEST_SELLER_ID, oauthConfig.MP_OAUTH_CLIENT_ID);
   await preserveEvidence(prefix + '-evidence.json');
   const session = createConnectedPixSession({ attempt, secret: spikeConfig.MP_SPIKE_WEBHOOK_SECRET, fetcher: createPixNativeHttps(),
    processingMode: name === 'orders_automatic_fresh' ? 'automatic' : undefined,
    store: pixWebhookFileStore(local(prefix + '-inbox.json')),
    saveAttempt: a => savePixProofFile(local(prefix + '-attempt.json'), a),
    saveEvidence: e => savePixProofFile(local(prefix + '-evidence.json'), { ...e, scenario: name, transport: 'node:https', updatedAt: new Date().toISOString() }),
    saveDiagnostic: d => savePixProofFile(local(prefix + '-error-' + Date.now() + '.json'), { ...d, observedAt: new Date().toISOString() }),
   });
   orderSteps.push({ name, session, resourceId: () => attempt.orderId });
  }
  const prefix = 'pix-comparison-payments_app_usr_fresh';
  const attempt = await loadPixPaymentAttempt(local(prefix + '-attempt.json'), oauthConfig.MP_OAUTH_EXPECTED_TEST_SELLER_ID, oauthConfig.MP_OAUTH_CLIENT_ID);
  await preserveEvidence(prefix + '-evidence.json');
  const session = createPixPaymentSession({ attempt, secret: spikeConfig.MP_SPIKE_WEBHOOK_SECRET, fetcher: createPixNativeHttps(),
   store: pixWebhookFileStore(local(prefix + '-inbox.json')),
   saveAttempt: a => savePixProofFile(local(prefix + '-attempt.json'), a),
   saveEvidence: e => savePixProofFile(local(prefix + '-evidence.json'), { ...e, scenario: 'payments_app_usr_fresh', transport: 'node:https', updatedAt: new Date().toISOString() }),
   saveDiagnostic: d => savePixProofFile(local(prefix + '-error-' + Date.now() + '.json'), { ...d, observedAt: new Date().toISOString() }),
  });
  await preserveEvidence('pix-comparison-summary.json');
  comparison = createPixComparison([...orderSteps, { name: 'payments_app_usr_fresh', session, resourceId: () => attempt.paymentId }], e => savePixProofFile(local('pix-comparison-summary.json'), e));
  webhook = req => comparison!.webhook(req);
 } else if (oauthConfig.MP_OAUTH_PAYMENT_ENABLED === '1') {
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(spikeConfig.MP_SPIKE_WEBHOOK_SECRET ?? '')) throw new Error('Assinatura não configurada.');
  const prefix = oauthConfig.MP_OAUTH_PAYMENT_SCENARIO === 'sandbox_fresh' ? 'pix-payment-sandbox-fresh' : 'pix-payment';
  const attempt = await loadPixPaymentAttempt(local(prefix + '-attempt.json'), oauthConfig.MP_OAUTH_EXPECTED_TEST_SELLER_ID, oauthConfig.MP_OAUTH_CLIENT_ID);
  await preserveEvidence(prefix + '-evidence.json');
  payments = createPixPaymentSession({ attempt, secret: spikeConfig.MP_SPIKE_WEBHOOK_SECRET, store: pixWebhookFileStore(local(prefix + '-inbox.json')),
   fetcher: createPixNativeHttps(),
   saveAttempt: state => savePixProofFile(local(prefix + '-attempt.json'), state),
   saveEvidence: evidence => savePixProofFile(local(prefix + '-evidence.json'), { ...evidence, transport: 'node:https', credentialProfile: 'sandbox_token', updatedAt: new Date().toISOString() }),
   saveDiagnostic: diagnostic => savePixProofFile(local(prefix + '-error-' + Date.now() + '.json'), { ...diagnostic, observedAt: new Date().toISOString() }),
  });
  await savePixProofFile(local(prefix + '-evidence.json'), payments.snapshot());
  webhook = req => payments!.webhook(req);
 } else if (oauthConfig.MP_OAUTH_PIX_ENABLED === '1') {
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(spikeConfig.MP_SPIKE_WEBHOOK_SECRET ?? '')) throw new Error('Assinatura não configurada.');
  const attempt = await loadConnectedPixAttempt(local('pix-connected-order.json'), oauthConfig.MP_OAUTH_EXPECTED_TEST_SELLER_ID, oauthConfig.MP_OAUTH_CLIENT_ID);
  await preserveEvidence('pix-connected-evidence.json');
  connected = createConnectedPixSession({ attempt, secret: spikeConfig.MP_SPIKE_WEBHOOK_SECRET,
   fetcher: oauthConfig.MP_OAUTH_NATIVE_ORDERS === '1' ? createPixNativeHttps() : fetch,
   store: pixWebhookFileStore(local('pix-connected-inbox.json')),
   saveAttempt: state => savePixProofFile(local('pix-connected-order.json'), state),
   saveEvidence: evidence => savePixProofFile(local('pix-connected-evidence.json'), { ...evidence, transport: oauthConfig.MP_OAUTH_NATIVE_ORDERS === '1' ? 'node:https' : 'fetch', updatedAt: new Date().toISOString() }),
   saveDiagnostic: diagnostic => savePixProofFile(local('pix-orders-error-' + Date.now() + '.json'), { ...diagnostic, observedAt: new Date().toISOString(), ticket: 'WCS-54765' }),
  });
  await savePixProofFile(local('pix-connected-evidence.json'), connected.snapshot());
  webhook = req => connected!.webhook(req);
 } else if (spikeConfig.MP_SPIKE_WEBHOOK_SECRET) {
  const settings = pixSpikeSettings(spikeConfig);
  const attempt = JSON.parse(await readFile(local('pix-spike-state.json'), 'utf8')) as PixOrderAttempt;
  await inspectPixSandbox(settings); await queryPixOrder(settings, attempt);
  webhook = createPixWebhookHandler({ secret: spikeConfig.MP_SPIKE_WEBHOOK_SECRET, settings, attempt, store: pixWebhookFileStore(local('pix-webhook-inbox.json')) });
 }
 if (oauthConfig.MP_OAUTH_ENABLED !== '0' && oauthConfig.MP_OAUTH_REDIRECT_URI && oauthConfig.MP_OAUTH_EXPECTED_TEST_SELLER_ID) {
  const settings = pixOAuthSettings(oauthConfig);
  await preserveEvidence('pix-oauth-evidence.json');
  await savePixProofFile(local('pix-oauth-evidence.json'), { status: 'pending', startedAt: new Date().toISOString() });
  const attempt = createPixOAuthAttempt(settings, async evidence => {
   await savePixProofFile(local('pix-oauth-evidence.json'), { status: 'verified', verifiedAt: new Date().toISOString(), ...evidence });
  }, fetch, Date.now, comparison ? verified => comparison!.connect(verified) : connected ? verified => connected!.connect(verified) : payments ? verified => payments!.connect(verified) : undefined, connected || comparison ? 'orders_test_user' : 'sandbox_token');
  oauth = { authorizationUrl: attempt.authorizationUrl, async callback(input) {
   const result = await attempt.callback(input);
   if (result.diagnostic) {
    await savePixProofFile(local('pix-oauth-failure.json'), { ...result.diagnostic, failedAt: new Date().toISOString() });
   }
   console.log(`OAuth de teste: ${result.result}.`); return result;
  } };
  // Local-only link; verifier and seller tokens are never persisted.
  await writeFile(local('pix-oauth-start.json'), JSON.stringify({ authorizationUrl: oauth.authorizationUrl }), { mode: 0o600 });
  await writeFile(local('pix-oauth-link.txt'), oauth.authorizationUrl, { mode: 0o600 });
 }
} catch { console.error('Receptor não iniciou: confira a configuração isolada e preserve a tentativa. Nenhum segredo registrado.'); process.exit(1); }
const server = createPixReceiver(webhook, oauth);
server.on('error', () => { console.error('Receptor não iniciou. Confira a porta 3101.'); process.exitCode = 1; void connected?.close(); void payments?.close(); void comparison?.close(); });
server.listen(3101, '127.0.0.1', () => console.log(`Receptor isolado em 127.0.0.1:3101. OAuth de teste ${oauth ? 'configurado' : 'desabilitado'}; Pix conectado ${comparison ? 'comparação aguardando OAuth' : connected ? 'Orders aguardando OAuth' : payments ? 'Payments aguardando OAuth' : 'desabilitado'}.`));
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => {
 server.close(); server.closeAllConnections(); void connected?.close(); void payments?.close(); void comparison?.close();
});
