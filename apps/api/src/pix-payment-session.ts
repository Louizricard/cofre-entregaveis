import type { IncomingMessage } from 'node:http';
import { PixOrderProviderError } from './pix-order-spike.js';
import { runPixPaymentSpike, queryPixPayment, validatePaymentAttempt, type PixPaymentAttempt } from './pix-payment-spike.js';
import { spikeObject, type PixSpikeSettings } from './pix-spike.js';
import type { PixProviderDiagnostic } from './pix-provider-diagnostic.js';
import { createSandboxResourceWebhookHandler, type PixWebhookHandler, type PixWebhookStore } from './pix-webhook-spike.js';
export function createPixPaymentSession(options: {
 attempt: PixPaymentAttempt; secret: string; store: PixWebhookStore;
 saveAttempt: (attempt: PixPaymentAttempt) => Promise<void>;
 saveEvidence: (evidence: PaymentEvidence) => Promise<void>; fetcher?: typeof fetch;
 saveDiagnostic?: (diagnostic: PixProviderDiagnostic) => Promise<void>;
}) {
 const evidence: PaymentEvidence = { api: 'payments', phase: 'awaiting_oauth', oauthSellerVerified: false,
  idempotencyVerified: false, paymentConfirmed: false, webhookReconciled: false, webhookConfirmed: false, duplicateSeen: false,
  failure: null, providerError: null, status: null };
 let config: PixSpikeSettings | undefined; let handler: PixWebhookHandler | undefined;
 let closed = false; let connected = false; let task = Promise.resolve(); let queue = Promise.resolve();
 let timer: ReturnType<typeof setTimeout> | undefined;
 const abort = new AbortController();
 const fetcher: typeof fetch = (url, init) => {
  if (closed) throw new Error('Sessão encerrada.');
  return (options.fetcher ?? fetch)(url, { ...init, signal: AbortSignal.any([abort.signal, ...(init?.signal ? [init.signal] : [])]) });
 };
 function update(patch: Partial<PaymentEvidence>) {
  Object.assign(evidence, patch); const snapshot = { ...evidence };
  const operation = queue.catch(() => {}).then(() => options.saveEvidence(snapshot)); queue = operation; return operation;
 }
 async function run() {
  try {
   if (!config) throw new Error('OAuth ausente.');
   await update({ phase: 'creating_payment', oauthSellerVerified: true });
   const verifiedConfig = config;
   const result = await runPixPaymentSpike(verifiedConfig, options.attempt, async attempt => {
    await options.saveAttempt(attempt);
    if (closed || !attempt.paymentId) throw new Error('Sessão encerrada.');
    handler = createSandboxResourceWebhookHandler({ secret: options.secret, resourceId: attempt.paymentId, store: options.store,
     validateBody: (body, id) => body.type === 'payment' && body.live_mode === false && String(spikeObject(body.data).id) === id &&
      String(body.user_id) === verifiedConfig.userId && (body.application_id === undefined || String(body.application_id) === verifiedConfig.applicationId),
     query: () => queryPixPayment(verifiedConfig, options.attempt, fetcher),
     onReconciled: async current => {
      // Evidence only. Never settles a Cofre invoice or releases an original.
      // New deliveries overwrite current confirmation, including refund/cancellation.
      // A cached old approved delivery must not overwrite a newer refund/cancellation.
      if (current.duplicate) { await update({ duplicateSeen: true }); return; }
      await update({ webhookReconciled: true, webhookConfirmed: current.confirmed,
       duplicateSeen: evidence.duplicateSeen || current.duplicate, status: current.status,
       phase: current.confirmed ? 'webhook_confirmed' : 'awaiting_notification' });
     },
    });
   }, fetcher, options.saveDiagnostic);
   await update({ idempotencyVerified: true, paymentConfirmed: result.confirmed,
    status: evidence.webhookReconciled ? evidence.status : result.status,
    phase: evidence.webhookConfirmed ? 'webhook_confirmed' : 'awaiting_notification' });
  } catch (error) {
   if (closed) return;
   await update({ phase: 'failed', failure: error instanceof PixOrderProviderError ? 'PROVIDER_HTTP_' + error.httpStatus : 'PAYMENTS_PROOF_FAILED',
    providerError: error instanceof PixOrderProviderError ? error.providerError : null });
  }
 }
 return {
  connect(settings: PixSpikeSettings) {
   if (closed || connected) throw new Error('Sessão utilizada/encerrada.');
   validatePaymentAttempt(options.attempt, settings);
   // The OAuth hook plus authenticated expected test-user identity are mandatory.
   // A credential prefix alone is never evidence of a test account.
   connected = true; config = { ...settings };
   timer = setTimeout(() => { void this.close().catch(() => {}); }, 45 * 60 * 1000); timer.unref();
   task = run(); void task.catch(() => { handler = undefined; });
  },
  webhook(req: IncomingMessage) {
   return handler && !closed ? handler(req) : Promise.resolve({ status: 503, body: { result: 'PAYMENT_NOT_READY' } });
  },
  snapshot: () => ({ ...evidence }), wait: () => task,
  async close() {
   if (closed) return; closed = true; abort.abort(); if (timer) clearTimeout(timer);
   handler = undefined; if (config) config.accessToken = '';
   await task.catch(() => {});
   if (!['failed', 'webhook_confirmed'].includes(evidence.phase)) await update({ phase: 'session_closed' });
  },
 };
}
export interface PaymentEvidence {
 api: 'payments'; phase: 'awaiting_oauth' | 'creating_payment' | 'awaiting_notification' | 'webhook_confirmed' | 'failed' | 'session_closed';
 oauthSellerVerified: boolean; idempotencyVerified: boolean; paymentConfirmed: boolean;
 webhookReconciled: boolean; webhookConfirmed: boolean; duplicateSeen: boolean;
 failure: string | null; providerError: string | null; status: string | null;
}
