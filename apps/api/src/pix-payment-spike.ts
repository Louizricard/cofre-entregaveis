// Payments API proof, isolated from Orders attempts and from all product state.
import { randomUUID } from 'node:crypto';
import { open, readFile } from 'node:fs/promises';
import { inspectPixSandbox, spikeObject, type PixSpikeSettings } from './pix-spike.js';
import { PixOrderProviderError } from './pix-order-spike.js';
import { capturePixProviderDiagnostic, type PixProviderDiagnostic } from './pix-provider-diagnostic.js';
export interface PixPaymentAttempt {
 api: 'payments'; key: string; reference: string; userId: string; applicationId: string; paymentId: string | null;
}
export function validatePaymentAttempt(a: PixPaymentAttempt, config: Pick<PixSpikeSettings, 'userId' | 'applicationId'>) {
 if (!a || a.api !== 'payments' || a.userId !== config.userId || a.applicationId !== config.applicationId ||
  !/^[a-f0-9-]{36}$/.test(a.key) || !/^cofre-payment-[a-f0-9-]{36}$/.test(a.reference) ||
  (a.paymentId !== null && !/^[1-9][0-9]{0,19}$/.test(a.paymentId))) throw new Error('Tentativa Payments inválida; preserve o arquivo.');
}
export async function loadPixPaymentAttempt(path: string, userId: string, applicationId: string): Promise<PixPaymentAttempt> {
 if (!/^[1-9][0-9]{0,19}$/.test(userId) || !/^[1-9][0-9]{0,19}$/.test(applicationId)) throw new Error('IDs de teste inválidos.');
 let attempt: PixPaymentAttempt;
 try { attempt = JSON.parse(await readFile(path, 'utf8')) as PixPaymentAttempt; }
 catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Tentativa Payments inválida; preserve o arquivo.');
  attempt = { api: 'payments', key: randomUUID(), reference: 'cofre-payment-' + randomUUID(), userId, applicationId, paymentId: null };
  const file = await open(path, 'wx', 0o600);
  try { await file.writeFile(JSON.stringify(attempt)); await file.sync(); } finally { await file.close(); }
 }
 validatePaymentAttempt(attempt, { userId, applicationId }); return attempt;
}
export function validatePixPayment(value: unknown, config: PixSpikeSettings, attempt: PixPaymentAttempt) {
 validatePaymentAttempt(attempt, config);
 const p = spikeObject(value); const id = String(p.id);
 if ((typeof p.id !== 'string' && !(typeof p.id === 'number' && Number.isSafeInteger(p.id))) || !/^[1-9][0-9]{0,19}$/.test(id) || (attempt.paymentId && attempt.paymentId !== id)) throw new Error('ID Payments divergente.');
 if (String(p.collector_id) !== config.userId || p.external_reference !== attempt.reference || p.live_mode !== false ||
  p.currency_id !== 'BRL' || !(p.transaction_amount === 50 || p.transaction_amount === '50.00') ||
  p.payment_method_id !== 'pix' || p.payment_type_id !== 'bank_transfer') throw new Error('Pagamento divergente do cenário sandbox esperado.');
 // Legacy Payment responses may omit application_id. The authenticated OAuth token,
 // pinned resource, collector and reference are mandatory; an explicit app ID cannot diverge.
 if (p.application_id !== undefined && String(p.application_id) !== config.applicationId) throw new Error('Aplicação Payments divergente.');
 if (!['pending', 'approved', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(String(p.status))) throw new Error('Estado Payments desconhecido.');
 if (p.transaction_amount_refunded !== undefined && !(p.transaction_amount_refunded === 0 || p.transaction_amount_refunded === '0.00')) {
  if (p.status === 'approved') throw new Error('Pagamento aprovado com reembolso não pode comprovar quitação.');
 }
 return { paymentId: id, status: String(p.status), confirmed: p.status === 'approved' && p.status_detail === 'accredited' };
}
async function paymentRequest(config: PixSpikeSettings, attempt: PixPaymentAttempt, method: 'GET' | 'POST', fetcher: typeof fetch, saveDiagnostic?: (diagnostic: PixProviderDiagnostic) => Promise<void>) {
 const path = method === 'POST' ? '/v1/payments' : '/v1/payments/' + attempt.paymentId;
 let response: Response | undefined;
 const init: RequestInit = {
  method, redirect: 'error', signal: AbortSignal.timeout(15000),
  headers: { Authorization: 'Bearer ' + config.accessToken, Accept: 'application/json',
   ...(method === 'POST' ? { 'Content-Type': 'application/json', 'X-Idempotency-Key': attempt.key } : {}) },
  // No application_fee: the Cofre does not retain commission in this proof.
  body: method === 'POST' ? JSON.stringify({ transaction_amount: 50, description: 'Cofre - ensaio sandbox Pix', payment_method_id: 'pix',
   external_reference: attempt.reference, payer: { email: 'test@testuser.com', first_name: 'APRO' } }) : undefined,
 };
 // A provider 5xx can be transient or hide a committed POST. Never change its key/body.
 // Bound the proof to three sends; deterministic 4xx and network errors remain explicit.
 for (let send = 0; send < 3; send++) {
  try { response = await fetcher('https://api.mercadopago.com' + path, { ...init, signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('Falha de conexão Payments. Preserve a chave e referência para recuperação.'); }
  if (![500, 502, 503, 504].includes(response.status) || send === 2) break;
  await response.body?.cancel().catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** send));
 }
 if (!response) throw new Error('Resposta Payments ausente.');
 if (!response.ok) {
  let providerError: string | null = null;
  let value: unknown;
  if (saveDiagnostic) {
   const diagnostic = await capturePixProviderDiagnostic(response, config.accessToken, method, path);
   await saveDiagnostic(diagnostic); value = diagnostic.body;
  }
  try {
   if (!saveDiagnostic) value = await response.json();
   const payload = spikeObject(value);
   if (typeof payload.error === 'string' && ['bad_request', 'unauthorized', 'forbidden', 'unprocessable_entity', 'invalid_credentials', 'internal_error', 'internal_server_error'].includes(payload.error)) providerError = payload.error;
  } catch { /* Never retain descriptions, payloads, credentials or QR data. */ }
  throw new PixOrderProviderError(response.status, providerError);
 }
 return validatePixPayment(await response.json() as unknown, config, attempt);
}
export async function queryPixPayment(config: PixSpikeSettings, attempt: PixPaymentAttempt, fetcher: typeof fetch = fetch) {
 validatePaymentAttempt(attempt, config);
 if (!attempt.paymentId) throw new Error('Pagamento ainda não fixado.');
 return paymentRequest(config, attempt, 'GET', fetcher);
}
export async function runPixPaymentSpike(config: PixSpikeSettings, attempt: PixPaymentAttempt, save: (a: PixPaymentAttempt) => Promise<void>, fetcher: typeof fetch = fetch, saveDiagnostic?: (diagnostic: PixProviderDiagnostic) => Promise<void>) {
 validatePaymentAttempt(attempt, config);
 await inspectPixSandbox(config, fetcher);
 const initial = attempt.paymentId ? await queryPixPayment(config, attempt, fetcher) : await paymentRequest(config, attempt, 'POST', fetcher, saveDiagnostic);
 attempt.paymentId = initial.paymentId; await save(attempt);
 const repeated = await paymentRequest(config, attempt, 'POST', fetcher, saveDiagnostic);
 if (repeated.paymentId !== initial.paymentId) throw new Error('Repetição Payments divergente.');
 const result = await queryPixPayment(config, attempt, fetcher);
 return { ...result, idempotencyVerified: true };
}
