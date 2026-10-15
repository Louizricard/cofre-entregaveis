// One APRO proof, using only the token delivered by the verified seller OAuth.
import type { IncomingMessage } from 'node:http';
import { randomUUID } from 'node:crypto';
import { open, readFile, rename } from 'node:fs/promises';
import { runPixOrderSpike, PixOrderApplicationMismatch, PixOrderProviderError, type PixOrderAttempt } from './pix-order-spike.js';
import type { PixSpikeSettings } from './pix-spike.js';
import type { PixProviderDiagnostic } from './pix-provider-diagnostic.js';
import { createPixWebhookHandler, queryPixOrder, type PixWebhookHandler, type PixWebhookStore } from './pix-webhook-spike.js';

export async function savePixProofFile(path: string, value: object) {
 const temporary = path + '.' + randomUUID() + '.tmp';
 const file = await open(temporary, 'wx', 0o600);
 try { await file.writeFile(JSON.stringify(value)); await file.sync(); } finally { await file.close(); }
 await rename(temporary, path);
}
export async function loadConnectedPixAttempt(path: string, userId: string, applicationId: string): Promise<PixOrderAttempt> {
 if (!/^[1-9][0-9]{0,19}$/.test(userId) || !/^[1-9][0-9]{0,19}$/.test(applicationId)) throw new Error('Identificadores de teste inválidos.');
 let attempt: PixOrderAttempt;
 try { attempt = JSON.parse(await readFile(path, 'utf8')) as PixOrderAttempt; }
 catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Tentativa conectada inválida. Preserve o arquivo.');
  attempt = { key: randomUUID(), reference: 'cofre-spike-' + randomUUID(), userId, applicationId, orderId: null };
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(attempt)); await file.sync(); } finally { await file.close(); }
 }
 if (!attempt || attempt.userId !== userId || attempt.applicationId !== applicationId || !/^[a-f0-9-]{36}$/.test(attempt.key) || !/^cofre-spike-[a-f0-9-]{36}$/.test(attempt.reference) || (attempt.orderId !== null && !/^ORD[A-Z0-9]{10,64}$/.test(attempt.orderId))) throw new Error('Tentativa conectada divergente. Preserve a chave antes de continuar.');
 return attempt;
}

export interface ConnectedPixEvidence {
 phase: 'awaiting_oauth' | 'creating_order' | 'awaiting_notification' | 'webhook_confirmed' | 'failed' | 'session_closed';
 oauthSellerVerified: boolean; idempotencyVerified: boolean; orderConfirmed: boolean;
 webhookReconciled: boolean; webhookConfirmed: boolean; duplicateSeen: boolean;
 failure: string | null; observedApplicationId: string | null; providerError: string | null;
}
export function createConnectedPixSession(options: {
 attempt: PixOrderAttempt; secret: string; store: PixWebhookStore;
 saveAttempt: (attempt: PixOrderAttempt) => Promise<void>;
 saveEvidence: (evidence: ConnectedPixEvidence) => Promise<void>;
 saveDiagnostic?: (diagnostic: PixProviderDiagnostic) => Promise<void>;
 fetcher?: typeof fetch; pollDelayMs?: number; maxPolls?: number;
 processingMode?: 'automatic';
}) {
 const evidence: ConnectedPixEvidence = { phase: 'awaiting_oauth', oauthSellerVerified: false, idempotencyVerified: false, orderConfirmed: false,
  webhookReconciled: false, webhookConfirmed: false, duplicateSeen: false, failure: null, observedApplicationId: null, providerError: null };
 let writeQueue = Promise.resolve();
 let handler: PixWebhookHandler | undefined;
 let config: PixSpikeSettings | undefined;
 let connected = false; let closed = false;
 let task: Promise<void> = Promise.resolve();
 let timer: ReturnType<typeof setTimeout> | undefined;
 const abort = new AbortController();
 const fetcher: typeof fetch = async (url, init) => {
  if (closed) throw new Error('Sessão encerrada.');
  return (options.fetcher ?? fetch)(url, { ...init, signal: AbortSignal.any([abort.signal, ...(init?.signal ? [init.signal] : [])]) });
 };
 function update(patch: Partial<ConnectedPixEvidence>) {
  Object.assign(evidence, patch);
  const snapshot = { ...evidence };
  // A failed disk write must be surfaced, but does not poison future retries.
  const operation = writeQueue.catch(() => {}).then(() => options.saveEvidence(snapshot));
  writeQueue = operation; return operation;
 }
 async function pinned(attempt: PixOrderAttempt) {
  await options.saveAttempt(attempt);
  if (!config || closed) throw new Error('Sessão indisponível.');
  if (!handler) handler = createPixWebhookHandler({ secret: options.secret, settings: config, attempt, store: options.store, fetcher,
   onReconciled: async result => {
    // These are historical APRO proof markers, never product financial state.
    const confirmed = evidence.webhookConfirmed || result.confirmed;
    await update({ webhookReconciled: true, webhookConfirmed: confirmed, duplicateSeen: evidence.duplicateSeen || result.duplicate,
     ...(confirmed ? { phase: 'webhook_confirmed' } : {}) });
   } });
 }
 async function run() {
  try {
   if (!config) throw new Error('Token OAuth ausente.');
   await update({ phase: 'creating_order', oauthSellerVerified: true });
   const result = await runPixOrderSpike(config, options.attempt, pinned, fetcher, options.saveDiagnostic, options.processingMode);
   await update({ phase: evidence.webhookConfirmed ? 'webhook_confirmed' : 'awaiting_notification', idempotencyVerified: result.idempotencyVerified, orderConfirmed: result.confirmed });
   // Reconciliation GETs are distinct evidence from a provider-origin webhook.
   for (let count = 0; !closed && !evidence.orderConfirmed && count < (options.maxPolls ?? 12); count++) {
    await new Promise<void>(resolve => {
     if (abort.signal.aborted) { resolve(); return; }
     const onAbort = () => { clearTimeout(delay); resolve(); };
     const delay = setTimeout(() => { abort.signal.removeEventListener('abort', onAbort); resolve(); }, options.pollDelayMs ?? 5000);
     abort.signal.addEventListener('abort', onAbort, { once: true });
    });
    if (closed) break;
    const current = await queryPixOrder(config, options.attempt, fetcher);
    await update({ orderConfirmed: evidence.orderConfirmed || current.confirmed });
   }
  } catch (error) {
   if (closed) return;
   await update({ phase: 'failed', failure: error instanceof PixOrderProviderError ? 'PROVIDER_HTTP_' + error.httpStatus
    : error instanceof PixOrderApplicationMismatch ? 'ORDER_APPLICATION_MISMATCH' : 'CONNECTED_PROOF_FAILED',
   observedApplicationId: error instanceof PixOrderApplicationMismatch ? error.observedApplicationId : null,
   providerError: error instanceof PixOrderProviderError ? error.providerError : null });
  }
 }
 return {
  connect(settings: PixSpikeSettings) {
   if (connected || closed) throw new Error('Sessão OAuth já utilizada.');
   if (settings.userId !== options.attempt.userId || settings.applicationId !== options.attempt.applicationId) throw new Error('Identidade OAuth divergente da tentativa.');
   connected = true; config = { ...settings };
   // No token is written to disk. Provider calls begin only after callback identity proof.
   timer = setTimeout(() => { void this.close().catch(() => {}); }, 45 * 60 * 1000); timer.unref();
   task = run();
   // The callback returns immediately, while the order proof runs in the background.
   void task.catch(() => { handler = undefined; });
  },
  webhook(req: IncomingMessage) {
   if (!handler || closed) return Promise.resolve({ status: 503, body: { result: 'CONNECTED_ORDER_NOT_READY' } });
   return handler(req);
  },
  wait: () => task,
  snapshot: () => ({ ...evidence }),
  async close() {
   if (closed) return;
   closed = true; abort.abort(); if (timer) clearTimeout(timer);
   handler = undefined; if (config) config.accessToken = '';
   await task.catch(() => {});
   if (evidence.phase !== 'webhook_confirmed' && evidence.phase !== 'failed') await update({ phase: 'session_closed' });
  },
 };
}
