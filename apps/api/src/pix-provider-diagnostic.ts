// Local-only error evidence. Never attach this payload to an Error or console log.
export interface PixProviderDiagnostic {
 method: 'GET' | 'POST'; path: string; httpStatus: number; requestId: string | null;
 body: unknown; complete: boolean; redacted: boolean;
}
export async function capturePixProviderDiagnostic(response: Response, accessToken: string, method: 'GET' | 'POST', path: string): Promise<PixProviderDiagnostic> {
 const header = response.headers.get('x-request-id');
 const diagnostic: PixProviderDiagnostic = { method, path, httpStatus: response.status,
  requestId: header && /^[A-Za-z0-9_-]{1,128}$/.test(header) && !header.includes(accessToken) && !/^(TEST-|APP_USR-)/.test(header) ? header : null, body: null, complete: false, redacted: false };
 const chunks: Uint8Array[] = []; let size = 0;
 const reader = response.body?.getReader();
 if (!reader) return diagnostic;
 try {
  for (;;) {
   const { done, value } = await reader.read(); if (done) break;
   size += value.length;
   if (size > 32768) { await reader.cancel(); return diagnostic; }
   chunks.push(value);
  }
  const value = JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  function sanitize(input: unknown, depth = 0): unknown {
   if (depth > 32) throw new Error('Estrutura excessiva.');
   if (typeof input === 'string') {
    const cleaned = input.split(accessToken).join('[REDACTED]')
     .replace(/(?:TEST-|APP_USR-)[A-Za-z0-9_-]+/g, '[REDACTED]')
     .replace(/Bearer\s+[A-Za-z0-9_.-]+/gi, 'Bearer [REDACTED]');
    if (cleaned !== input) diagnostic.redacted = true;
    return cleaned;
   }
   if (Array.isArray(input)) return input.map(item => sanitize(item, depth + 1));
   if (input && typeof input === 'object') {
    return Object.fromEntries(Object.entries(input).map(([key, item]) => {
     const safeKey = sanitize(key, depth + 1) as string;
     if (/^(access_token|refresh_token|client_secret|authorization|secret|code_verifier|code_challenge|qr_code|qr_code_base64|ticket_url|payer|card)$/i.test(key)) {
      diagnostic.redacted = true; return [safeKey, '[REDACTED]'];
     }
     return [safeKey, sanitize(item, depth + 1)];
    }));
   }
   return input;
  }
  diagnostic.body = sanitize(value); diagnostic.complete = true;
 } catch { /* Invalid, huge or excessively nested bodies are never retained. */ }
 return diagnostic;
}
