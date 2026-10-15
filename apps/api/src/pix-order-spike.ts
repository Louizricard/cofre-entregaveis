import { inspectPixSandbox, spikeObject, type PixSpikeSettings } from './pix-spike.js';
import { capturePixProviderDiagnostic, type PixProviderDiagnostic } from './pix-provider-diagnostic.js';
export interface PixOrderAttempt { key: string; reference: string; userId: string; applicationId: string; orderId: string | null }
export class PixOrderProviderError extends Error {
 constructor(readonly httpStatus: number, readonly providerError: string | null = null) { super('O provedor recusou o ensaio. Tentativa local preservada.'); }
}
export class PixOrderApplicationMismatch extends Error {
 constructor(readonly observedApplicationId: string | null) { super('Aplicação da order divergente da configuração esperada.'); }
}
export function validatePixOrder(value: unknown, config: PixSpikeSettings, attempt: PixOrderAttempt) {
 const order = spikeObject(value);
 if (typeof order.id !== 'string' || !/^ORD[A-Z0-9]{10,64}$/.test(order.id) || (attempt.orderId && order.id !== attempt.orderId)) throw new Error('Identificador de order divergente.');
 if (String(order.user_id) !== config.userId || order.external_reference !== attempt.reference) throw new Error('Order não corresponde ao recebedor e referência esperados.');
 const applicationId = String(spikeObject(order.integration_data).application_id);
 if (applicationId !== config.applicationId) throw new PixOrderApplicationMismatch(/^[1-9][0-9]{0,19}$/.test(applicationId) ? applicationId : null);
 if (order.type !== 'online' || order.country_code !== 'BRA' || order.total_amount !== '50.00' || order.live_mode === true) throw new Error('Order divergente do cenário brasileiro de teste.');
 if (order.currency_id !== undefined && order.currency_id !== 'BRL') throw new Error('Moeda divergente do cenário brasileiro de teste.');
 const payments = spikeObject(order.transactions).payments;
 if (!Array.isArray(payments) || payments.length !== 1) throw new Error('Transações divergentes do cenário de teste.');
 const payment = spikeObject(payments[0]); const method = spikeObject(payment.payment_method);
 if (payment.amount !== '50.00' || method.id !== 'pix' || method.type !== 'bank_transfer') throw new Error('Valor ou meio de pagamento divergente.');
 if (!['action_required', 'processed'].includes(String(order.status)) || !['action_required', 'processed'].includes(String(payment.status))) throw new Error('Estado inesperado para o cenário APRO.');
 return { orderId: order.id, status: String(order.status), confirmed: order.status === 'processed' && order.status_detail === 'accredited' && payment.status === 'processed' && payment.status_detail === 'accredited' };
}
export async function runPixOrderSpike(config: PixSpikeSettings, attempt: PixOrderAttempt, save: (attempt: PixOrderAttempt) => Promise<void>, fetcher: typeof fetch = fetch, saveDiagnostic?: (diagnostic: PixProviderDiagnostic) => Promise<void>, processingMode?: 'automatic') {
 // Never POST before the account is positively identified as the expected test user.
 await inspectPixSandbox(config, fetcher);
 if (attempt.userId !== config.userId || attempt.applicationId !== config.applicationId || !/^[a-f0-9-]{36}$/.test(attempt.key) || !/^cofre-spike-[a-f0-9-]{36}$/.test(attempt.reference) || (attempt.orderId !== null && !/^ORD[A-Z0-9]{10,64}$/.test(attempt.orderId))) throw new Error('Tentativa local não corresponde à configuração. Preserve o arquivo e confira o ensaio.');
 const body = JSON.stringify({ type: 'online', external_reference: attempt.reference, total_amount: '50.00', ...(processingMode ? { processing_mode: processingMode } : {}), payer: { email: 'test@testuser.com', first_name: 'APRO' }, transactions: { payments: [{ amount: '50.00', payment_method: { id: 'pix', type: 'bank_transfer' } }] } });
 async function request(method: 'GET' | 'POST', path: string) {
  let response: Response;
  try { response = await fetcher('https://api.mercadopago.com' + path, { method, headers: { Authorization: 'Bearer ' + config.accessToken, Accept: 'application/json',
   ...(method === 'POST' ? { 'Content-Type': 'application/json', 'X-Idempotency-Key': attempt.key } : {}) }, body: method === 'POST' ? body : undefined, redirect: 'error', signal: AbortSignal.timeout(15000) }); }
  catch { throw new Error('Falha de conexão no ensaio. Tentativa local preservada; repita o comando para recuperar.'); }
  if (!response.ok) {
   let errorPayload: unknown;
   if (saveDiagnostic) {
    const diagnostic = await capturePixProviderDiagnostic(response, config.accessToken, method, path);
    await saveDiagnostic(diagnostic);
    errorPayload = diagnostic.body;
   } else {
    try { errorPayload = await response.json() as unknown; } catch { /* Status only. */ }
   }
   let providerError: string | null = null;
   try {
    const payload = spikeObject(errorPayload);
    const nestedCode = (value: unknown) => value && typeof value === 'object' && !Array.isArray(value) ? spikeObject(value).code : undefined;
    const candidates = [payload.error, payload.code, nestedCode(payload.error),
     ...(Array.isArray(payload.errors) ? payload.errors.map(nestedCode) : [])];
    const allowed = ['invalid_credentials', 'unauthorized', 'forbidden', 'invalid_email_for_sandbox', 'idempotency_key_already_used'];
    providerError = candidates.find((value): value is string => typeof value === 'string' && allowed.includes(value)) ?? null;
   } catch { /* Unknown payloads retain only HTTP status. */ }
   throw new PixOrderProviderError(response.status, providerError);
  }
  try { return await response.json() as unknown; } catch { throw new Error('Resposta inválida do provedor. Tentativa local preservada.'); }
 }
 // Recover a recorded order first; use the same payload/key even after a lost reply.
 let result = attempt.orderId ? validatePixOrder(await request('GET', '/v1/orders/' + attempt.orderId), config, attempt)
  : validatePixOrder(await request('POST', '/v1/orders'), config, attempt);
 attempt.orderId = result.orderId; await save(attempt);
 const repeated = validatePixOrder(await request('POST', '/v1/orders'), config, attempt);
 if (repeated.orderId !== result.orderId) throw new Error('O provedor não recuperou a mesma order. Não crie outra tentativa.');
 result = validatePixOrder(await request('GET', '/v1/orders/' + attempt.orderId), config, attempt);
 return { ...result, idempotencyVerified: true };
}
