// Isolated Authorization Code proof. No product state, payments or token persistence.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { inspectPixSandbox, spikeObject, type PixSpikeSettings } from './pix-spike.js';

export interface PixOAuthSettings { clientId: string; clientSecret: string; sellerId: string; redirectUri: string }
export interface PixOAuthEvidence { sandboxSellerVerified: true; stateVerified: true; pkceUsed: true; tokensPersisted: false; readScopeGranted: boolean; writeScopeGranted: boolean }
export interface PixOAuthResult { status: number; result: string; diagnostic?: { httpStatus: number; providerError: string | null;
 stage?: 'scope_validation'; scopePresent?: boolean; scopeType?: 'string' | 'array' | 'other' | 'missing';
 scopeLength?: number; commaSeparated?: boolean; readScopeGranted?: boolean; writeScopeGranted?: boolean } }
export interface PixOAuthAttempt { authorizationUrl: string; callback(url: string): Promise<PixOAuthResult> }
export function pixOAuthSettings(env: NodeJS.ProcessEnv): PixOAuthSettings {
 const clientId = env.MP_OAUTH_CLIENT_ID ?? ''; const clientSecret = env.MP_OAUTH_CLIENT_SECRET ?? '';
 const sellerId = env.MP_OAUTH_EXPECTED_TEST_SELLER_ID ?? ''; const redirectUri = env.MP_OAUTH_REDIRECT_URI ?? '';
 if (!/^[1-9][0-9]{0,19}$/.test(clientId) || !/^[A-Za-z0-9_-]{16,512}$/.test(clientSecret) || !/^[1-9][0-9]{0,19}$/.test(sellerId)) throw new Error('Configuração OAuth incompleta.');
 const uri = new URL(redirectUri);
 if (uri.protocol !== 'https:' || !/^[a-z0-9-]+\.trycloudflare\.com$/.test(uri.hostname) || uri.port || uri.username || uri.password || uri.pathname !== '/oauth/callback' || uri.search || uri.hash || uri.href !== redirectUri) throw new Error('Callback OAuth de teste inválido.');
 return { clientId, clientSecret, sellerId, redirectUri };
}

export function createPixOAuthAttempt(settings: PixOAuthSettings, saveEvidence: (evidence: PixOAuthEvidence) => Promise<void>, fetcher: typeof fetch = fetch, now: () => number = Date.now, onVerified?: (settings: PixSpikeSettings) => void, profile: 'sandbox_token' | 'orders_test_user' = 'sandbox_token'): PixOAuthAttempt {
 // Validate again for direct callers; never allow environment overrides of provider URLs.
 pixOAuthSettings({ MP_OAUTH_CLIENT_ID: settings.clientId, MP_OAUTH_CLIENT_SECRET: settings.clientSecret, MP_OAUTH_EXPECTED_TEST_SELLER_ID: settings.sellerId, MP_OAUTH_REDIRECT_URI: settings.redirectUri });
 const state = randomBytes(32).toString('base64url');
 let verifier = randomBytes(48).toString('base64url');
 const expiresAt = now() + 10 * 60 * 1000;
 let consumed = false;
 const auth = new URL('https://auth.mercadopago.com/authorization');
 auth.search = new URLSearchParams({ client_id: settings.clientId, response_type: 'code', platform_id: 'mp', state, redirect_uri: settings.redirectUri,
  code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' }).toString();
 return {
  authorizationUrl: auth.href,
  async callback(input) {
   const reply = (status: number, result: string) => ({ status, result });
   if (input.length > 4096) return reply(400, 'INVALID_CALLBACK');
   let url: URL;
   try { url = new URL(input, settings.redirectUri); } catch { return reply(400, 'INVALID_CALLBACK'); }
   if (url.origin !== new URL(settings.redirectUri).origin || url.pathname !== '/oauth/callback' || url.hash) return reply(400, 'INVALID_CALLBACK');
   const params = url.searchParams; const receivedState = params.get('state') ?? '';
   if (params.getAll('state').length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(receivedState) || !timingSafeEqual(Buffer.from(state), Buffer.from(receivedState))) return reply(400, 'INVALID_STATE');
   if (consumed) return reply(409, 'ATTEMPT_ALREADY_USED');
   if (now() >= expiresAt) { consumed = true; verifier = ''; return reply(410, 'ATTEMPT_EXPIRED'); }
   if (params.has('error')) { consumed = true; verifier = ''; return reply(400, 'AUTHORIZATION_DENIED'); }
   const code = params.get('code');
   if (params.getAll('code').length !== 1 || !code || !/^[A-Za-z0-9_-]{8,2048}$/.test(code)) return reply(400, 'INVALID_CODE');
   // Consume synchronously before any await: simultaneous/repeated callbacks never exchange twice.
   consumed = true;
   const codeVerifier = verifier; verifier = '';
   try {
    const response = await fetcher('https://api.mercadopago.com/oauth/token', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(12000),
     headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
     // Orders sandbox requires APP_USR credentials belonging to a test user.
     // This selects the credential family, never permission to charge a real seller.
     body: JSON.stringify({ client_id: settings.clientId, client_secret: settings.clientSecret, code, grant_type: 'authorization_code', redirect_uri: settings.redirectUri, code_verifier: codeVerifier, test_token: profile !== 'orders_test_user' }) });
    if (!response.ok) {
     let providerError: string | null = null;
     try {
      const error = spikeObject(await response.json()).error;
      // Only standard error enums, never provider messages/descriptions or payloads.
      if (typeof error === 'string' && ['invalid_request', 'invalid_client', 'invalid_grant', 'unauthorized_client', 'unsupported_grant_type', 'invalid_scope', 'access_denied', 'temporarily_unavailable', 'server_error'].includes(error)) providerError = error;
     } catch { /* Keep only the HTTP status if the error body is unknown. */ }
     return { status: 502, result: 'TOKEN_EXCHANGE_FAILED', diagnostic: { httpStatus: response.status, providerError } };
    }
    const token = spikeObject(await response.json());
    if (typeof token.access_token !== 'string' || !/^[A-Za-z0-9_-]{16,512}$/.test(token.access_token) || String(token.user_id) !== settings.sellerId || String(token.token_type).toLowerCase() !== 'bearer') return reply(403, 'SANDBOX_SELLER_REQUIRED');
    if (profile === 'orders_test_user' ? !token.access_token.startsWith('APP_USR-') : token.live_mode === true) return reply(403, 'SANDBOX_SELLER_REQUIRED');
    // Providers can grant many additional scopes. Do not discard read/write because
    // the complete space-separated list is longer than an arbitrary short limit.
    const scopes = typeof token.scope === 'string' ? token.scope.trim().split(/\s+/) : [];
    const readScopeGranted = scopes.includes('read'); const writeScopeGranted = scopes.includes('write');
    // Identity access alone does not prove permission to create a payment.
    if (onVerified && (!readScopeGranted || !writeScopeGranted)) return { status: 403, result: 'PAYMENT_SCOPES_REQUIRED', diagnostic: {
     httpStatus: response.status, providerError: null, stage: 'scope_validation',
     scopePresent: Object.hasOwn(token, 'scope'), scopeType: token.scope === undefined ? 'missing' : typeof token.scope === 'string' ? 'string' : Array.isArray(token.scope) ? 'array' : 'other',
     scopeLength: typeof token.scope === 'string' ? token.scope.length : undefined,
     commaSeparated: typeof token.scope === 'string' && token.scope.includes(','), readScopeGranted, writeScopeGranted,
    } };
    // Token live_mode describes credentials, not a payment. For Orders only,
    // authenticated expected ID + MLB + test_user prove the test account.
    // Prefix and test_token are not proof: identify the account via the authenticated endpoint.
    await inspectPixSandbox({ accessToken: token.access_token, userId: settings.sellerId, applicationId: settings.clientId }, fetcher);
    await saveEvidence({ sandboxSellerVerified: true, stateVerified: true, pkceUsed: true, tokensPersisted: false, readScopeGranted, writeScopeGranted });
    // Opt-in connected proof receives only the positively identified sandbox access token.
    // Neither flow persists tokens; refresh tokens are never passed to the proof.
    onVerified?.({ accessToken: token.access_token, userId: settings.sellerId, applicationId: settings.clientId });
    return reply(200, 'SANDBOX_SELLER_CONNECTED');
   } catch { return reply(502, 'OAUTH_PROOF_FAILED'); }
  },
 };
}
