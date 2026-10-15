// Isolated sandbox evidence only: never imports the product database or releases files.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { open, readFile, rename } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { validatePixOrder, type PixOrderAttempt } from './pix-order-spike.js';
import { spikeObject, type PixSpikeSettings } from './pix-spike.js';

export type PixWebhookReply = { status: number; body: { result: string } };
export type PixWebhookHandler = (req: IncomingMessage) => Promise<PixWebhookReply>;
type Receipt = { digest: string; status: string; confirmed: boolean };
type Inbox = Record<string, Receipt>;
export interface PixWebhookStore { read(): Promise<Inbox>; write(inbox: Inbox): Promise<void> }

export function pixWebhookFileStore(path: string): PixWebhookStore {
 return {
  async read() {
   try {
    const raw = await readFile(path);
    if (raw.length > 65536) throw new Error('inbox');
    const inbox = spikeObject(JSON.parse(raw.toString()) as unknown);
    if (Object.keys(inbox).length > 100) throw new Error('inbox');
    for (const [key, value] of Object.entries(inbox)) {
     const item = spikeObject(value);
     if (!/^[a-f0-9]{64}$/.test(key) || !/^[a-f0-9]{64}$/.test(String(item.digest)) || !['action_required', 'processed', 'pending', 'approved', 'in_process', 'rejected', 'cancelled', 'refunded', 'charged_back'].includes(String(item.status)) || typeof item.confirmed !== 'boolean') throw new Error('inbox');
    }
    return inbox as Inbox;
   } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}; throw new Error('Inbox local inválida.'); }
  },
  async write(inbox) {
   const temporary = path + '.' + randomUUID() + '.tmp';
   const file = await open(temporary, 'wx', 0o600);
   try { await file.writeFile(JSON.stringify(inbox)); await file.sync(); } finally { await file.close(); }
   await rename(temporary, path);
  },
 };
}

export async function queryPixOrder(settings: PixSpikeSettings, attempt: PixOrderAttempt, fetcher: typeof fetch = fetch) {
 if (!attempt.orderId || !/^ORD[A-Z0-9]{10,64}$/.test(attempt.orderId) || attempt.userId !== settings.userId || attempt.applicationId !== settings.applicationId || !/^cofre-spike-[a-f0-9-]{36}$/.test(attempt.reference)) throw new Error('Tentativa inválida.');
 const response = await fetcher('https://api.mercadopago.com/v1/orders/' + attempt.orderId, {
  method: 'GET', headers: { Authorization: 'Bearer ' + settings.accessToken, Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(15000),
 });
 if (!response.ok) throw new Error('Consulta recusada.');
 return validatePixOrder(await response.json() as unknown, settings, attempt);
}

export function createPixWebhookHandler(options: {
 secret: string; settings: PixSpikeSettings; attempt: PixOrderAttempt; store: PixWebhookStore;
 fetcher?: typeof fetch; now?: () => number;
 onReconciled?: (result: { confirmed: boolean; status: string; duplicate: boolean }) => Promise<void>;
}): PixWebhookHandler {
 if (!/^[A-Za-z0-9_-]{16,512}$/.test(options.secret) || !options.attempt.orderId || !/^ORD[A-Z0-9]{10,64}$/.test(options.attempt.orderId)) throw new Error('Configuração de webhook inválida.');
 return createSandboxResourceWebhookHandler({ secret: options.secret, resourceId: options.attempt.orderId, store: options.store, now: options.now,
  query: () => queryPixOrder(options.settings, options.attempt, options.fetcher), onReconciled: options.onReconciled,
  validateBody: (body, id) => body.type === 'order' && body.live_mode === false && spikeObject(body.data).id === id &&
   (body.user_id === undefined || String(body.user_id) === options.settings.userId) &&
   (body.application_id === undefined || String(body.application_id) === options.settings.applicationId),
 });
}

// Shared transport/signature/inbox only. Each API supplies its own identity and financial validation.
export function createSandboxResourceWebhookHandler(options: {
 secret: string; resourceId: string; store: PixWebhookStore; now?: () => number;
 validateBody: (body: Record<string, unknown>, id: string) => boolean;
 query: () => Promise<{ status: string; confirmed: boolean }>;
 onReconciled?: (result: { confirmed: boolean; status: string; duplicate: boolean }) => Promise<void>;
}): PixWebhookHandler {
 if (!/^[A-Za-z0-9_-]{16,512}$/.test(options.secret) || !/^[A-Za-z0-9]{1,80}$/.test(options.resourceId)) throw new Error('Configuração de webhook inválida.');
 let busy = false;
 const reply = (status: number, result: string): PixWebhookReply => ({ status, body: { result } });
 const header = (req: IncomingMessage, name: string) => {
  if (req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === name).length !== 1) return '';
  const value = req.headers[name]; return typeof value === 'string' ? value : '';
 };
 return async req => {
  const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
  const id = query.get('data.id'); const requestId = header(req, 'x-request-id');
  const signature = header(req, 'x-signature');
  const parts = signature.split(',').map(part => part.trim());
  const ts = parts.find(part => /^ts=\d{10}(?:\d{3})?$/.test(part))?.slice(3);
  const v1 = parts.find(part => /^v1=[a-fA-F0-9]{64}$/.test(part))?.slice(3);
  if (!id || query.getAll('data.id').length !== 1 || id !== options.resourceId || !/^[A-Za-z0-9_-]{1,128}$/.test(requestId) || parts.length !== 2 || !ts || !v1) return reply(401, 'INVALID_SIGNATURE');
  const time = Number(ts) * (ts.length === 10 ? 1000 : 1);
  if (Math.abs((options.now ?? Date.now)() - time) > 300000) return reply(401, 'EXPIRED_SIGNATURE');
  // Match buildManifest in the official Node SDK: use the query ID verbatim.
  const expected = createHmac('sha256', options.secret).update(`id:${id};request-id:${requestId};ts:${ts};`).digest();
  if (!timingSafeEqual(expected, Buffer.from(v1, 'hex'))) return reply(401, 'INVALID_SIGNATURE');
  if (!/^application\/json(?:\s*;|$)/i.test(header(req, 'content-type'))) return reply(415, 'JSON_REQUIRED');
  // Reject early and bound streaming bodies; no raw request is ever logged or persisted.
  if (Number(req.headers['content-length'] ?? 0) > 16384) return reply(413, 'BODY_TOO_LARGE');
  const chunks: Buffer[] = []; let length = 0;
  try {
   for await (const chunk of req) {
    const buffer = Buffer.from(chunk as Uint8Array); length += buffer.length;
    if (length > 16384) return reply(413, 'BODY_TOO_LARGE');
    chunks.push(buffer);
   }
  } catch { return reply(400, 'INVALID_BODY'); }
  const raw = Buffer.concat(chunks);
  try {
   const body = spikeObject(JSON.parse(raw.toString()) as unknown);
   if (!options.validateBody(body, id)) return reply(400, 'SANDBOX_ORDER_REQUIRED');
  } catch { return reply(400, 'INVALID_BODY'); }
  if (busy) return reply(503, 'RETRY');
  busy = true;
  try {
   // x-request-id is signed; Orders notifications may omit a top-level event ID.
   // A new delivery ID is reconciled again. No financial side effect exists in this spike.
   const key = createHash('sha256').update(id + ':' + requestId).digest('hex');
   const digest = createHash('sha256').update(raw).digest('hex');
   const inbox = await options.store.read();
   if (Object.hasOwn(inbox, key)) {
    if (inbox[key].digest !== digest) return reply(409, 'DELIVERY_CONFLICT');
    await options.onReconciled?.({ confirmed: inbox[key].confirmed, status: inbox[key].status, duplicate: true });
    return reply(200, 'DUPLICATE');
   }
   if (Object.keys(inbox).length >= 100) return reply(503, 'INBOX_FULL');
   const result = await options.query();
   // Confirmation comes exclusively from the authenticated GET, never body.status/amount.
   inbox[key] = { digest, status: result.status, confirmed: result.confirmed };
   await options.store.write(inbox);
   await options.onReconciled?.({ confirmed: result.confirmed, status: result.status, duplicate: false });
   return reply(200, 'SANDBOX_RECONCILED');
  } catch { return reply(503, 'RECONCILIATION_FAILED'); }
  finally { busy = false; }
 };
}
