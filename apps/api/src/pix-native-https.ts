import { request } from 'node:https';

// Isolated diagnostic transport. No redirects or arbitrary destinations carrying a seller token.
export function createPixNativeHttps(transport: typeof request = request): typeof fetch {
 return async (input, init) => {
  if (typeof input !== 'string' && !(input instanceof URL)) throw new Error('PIX_NATIVE_INPUT');
  const url = new URL(input);
  const method = init?.method ?? 'GET';
  const identity = url.hostname === 'api.mercadolibre.com' && url.pathname === '/users/me' && method === 'GET';
  const orders = url.hostname === 'api.mercadopago.com' && ((url.pathname === '/v1/orders' && method === 'POST') ||
   (/^\/v1\/orders\/ORD[A-Z0-9]{10,64}$/.test(url.pathname) && method === 'GET'));
  const payments = url.hostname === 'api.mercadopago.com' && ((url.pathname === '/v1/payments' && method === 'POST') ||
   (/^\/v1\/payments\/[1-9][0-9]{0,19}$/.test(url.pathname) && method === 'GET'));
  if (url.protocol !== 'https:' || url.port || url.username || url.password || url.search || url.hash || (!identity && !orders && !payments)) throw new Error('PIX_NATIVE_DESTINATION');
  if (init?.body != null && typeof init.body !== 'string') throw new Error('PIX_NATIVE_BODY');
  const body = init?.body ?? undefined;
  if ((method === 'GET' && body !== undefined) || (body !== undefined && Buffer.byteLength(body) > 32768)) throw new Error('PIX_NATIVE_BODY');
  const headers = Object.fromEntries(new Headers(init?.headers).entries());
  if (body !== undefined) headers['content-length'] = String(Buffer.byteLength(body));
  return new Promise<Response>((resolve, reject) => {
   if (init?.signal?.aborted) { reject(new Error('PIX_NATIVE_ABORTED')); return; }
   const req = transport(url, { method, headers, signal: init?.signal ?? undefined }, res => {
    const chunks: Buffer[] = []; let size = 0;
    res.on('data', (chunk: Buffer) => {
     size += chunk.length;
     if (size > 65536) { res.destroy(); reject(new Error('PIX_NATIVE_RESPONSE_LIMIT')); }
     else chunks.push(chunk);
    });
    res.on('error', () => reject(new Error('PIX_NATIVE_RESPONSE')));
    res.on('aborted', () => reject(new Error('PIX_NATIVE_RESPONSE')));
    res.on('end', () => {
     const status = res.statusCode ?? 0;
     if (status < 200 || status >= 600 || (status >= 300 && status < 400)) { reject(new Error('PIX_NATIVE_STATUS')); return; }
     const responseHeaders = new Headers();
     for (const [name, value] of Object.entries(res.headers)) {
      if (value !== undefined) responseHeaders.set(name, Array.isArray(value) ? value.join(', ') : value);
     }
     resolve(new Response(status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks), { status, headers: responseHeaders }));
    });
   });
   req.setTimeout(15000, () => req.destroy(new Error('PIX_NATIVE_TIMEOUT')));
   req.on('error', () => reject(new Error('PIX_NATIVE_REQUEST')));
   req.end(body);
  });
 };
}
