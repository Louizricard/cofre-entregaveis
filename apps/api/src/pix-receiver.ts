import { createServer } from 'node:http';
import type { PixWebhookHandler } from './pix-webhook-spike.js';
import type { PixOAuthAttempt } from './pix-oauth-spike.js';
// Isolated receiver. OAuth stays closed; optional sandbox handler has no product access.
export function createPixReceiver(webhook?: PixWebhookHandler, oauth?: PixOAuthAttempt) {
 const server = createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
  res.setHeader('Connection', 'close');
  const send = (status: number, body: object) => { res.statusCode = status; res.end(JSON.stringify(body)); };
  const path = (req.url ?? '').split('?')[0];
  if (!path.startsWith('/') || path.startsWith('//')) { send(400, { error: 'INVALID_REQUEST' }); return; }
  if (path === '/health' && req.method === 'GET') {
   send(200, { service: 'cofre-pix-isolated-receiver-v1', mode: oauth ? 'sandbox-oauth' : webhook ? 'sandbox-webhook' : 'transport-only', oauthReady: !!oauth, webhookReady: !!webhook }); return;
  }
  if (path === '/oauth/callback' && req.method === 'GET') {
   if (!oauth) { send(503, { error: 'OAUTH_NOT_CONFIGURED' }); return; }
   void oauth.callback(req.url ?? '').then(result => {
    // Remove code/state from the location before displaying a fixed result.
    res.statusCode = 303; res.setHeader('Location', result.status === 200 ? '/oauth/complete' : '/oauth/failed'); res.end();
   }, () => { res.statusCode = 303; res.setHeader('Location', '/oauth/failed'); res.end(); }); return;
  }
  if (oauth && path === '/oauth/complete' && req.method === 'GET') { send(200, { message: 'Consulte a evidência local do ensaio para confirmar a conta de teste. Esta página não comprova pagamento.' }); return; }
  if (oauth && path === '/oauth/failed' && req.method === 'GET') { send(400, { message: 'A conexão de teste não foi confirmada. Confira a evidência local e inicie outra tentativa quando necessário.' }); return; }
  if (path === '/webhooks/mercadopago' && req.method === 'POST') {
   if (!webhook) { send(503, { error: 'WEBHOOK_NOT_CONFIGURED' }); return; }
   void webhook(req).then(result => send(result.status, result.body), () => send(503, { error: 'RETRY' })); return;
  }
  send(404, { error: 'NOT_FOUND' });
 });
 server.requestTimeout = 5000;
 server.headersTimeout = 5000;
 server.maxHeadersCount = 40;
 server.maxConnections = 32;
 return server;
}
