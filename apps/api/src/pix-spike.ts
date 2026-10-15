// Isolated viability tooling. Never imported by the product API or workers.
export interface PixSpikeSettings { accessToken: string; userId: string; applicationId: string }
export function pixSpikeSettings(env: NodeJS.ProcessEnv): PixSpikeSettings {
 const accessToken = env.MP_SPIKE_ACCESS_TOKEN ?? '';
 const userId = env.MP_SPIKE_USER_ID ?? '';
 const applicationId = env.MP_SPIKE_APPLICATION_ID ?? '';
 if (!/^[A-Za-z0-9_-]{16,512}$/.test(accessToken) || !/^[1-9][0-9]{0,19}$/.test(userId) || !/^[1-9][0-9]{0,19}$/.test(applicationId)) {
  throw new Error('Preencha a credencial e os identificadores de TESTE em .local/pix-spike.env.');
 }
 return { accessToken, userId, applicationId };
}
export const spikeObject = (value: unknown): Record<string, unknown> => {
 if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Resposta inesperada do provedor.');
 return value as Record<string, unknown>;
};
export async function inspectPixSandbox(settings: PixSpikeSettings, fetcher: typeof fetch = fetch) {
 let response: Response;
 try {
  response = await fetcher('https://api.mercadolibre.com/users/me', {
   method: 'GET', headers: { Authorization: 'Bearer ' + settings.accessToken, Accept: 'application/json' },
   redirect: 'error', signal: AbortSignal.timeout(15000),
  });
 } catch { throw new Error('Não foi possível consultar a identidade no provedor. Nenhuma cobrança foi criada.'); }
 if (!response.ok) throw new Error('O provedor não confirmou a credencial de teste. Nenhuma cobrança foi criada.');
 let account: Record<string, unknown>;
 try { account = spikeObject(await response.json()); }
 catch { throw new Error('Resposta inesperada do provedor. Nenhuma cobrança foi criada.'); }
 if ((typeof account.id !== 'number' && typeof account.id !== 'string') || String(account.id) !== settings.userId) throw new Error('A credencial não corresponde ao User ID de TESTE esperado.');
 if (account.site_id !== 'MLB' || !Array.isArray(account.tags) || !account.tags.includes('test_user')) throw new Error('A conta não foi confirmada como usuário brasileiro de teste. Não prossiga com cobranças.');
 // Do not return credentials, personal details or the provider response.
 return { testUserVerified: true, country: 'BR', readOnly: true } as const;
}
