import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
// Source tooling and compiled entrypoints also accept environment variables directly.
export interface StorageSettings { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string }
export interface Settings { databaseUrl: string; origin: string; production: boolean; sessionDays: number; port: number; storage?: StorageSettings }
export function settings(): Settings {
 const origin = process.env.APP_ORIGIN ?? 'http://localhost:8080';
 const parsed = new URL(origin);
 if (parsed.origin !== origin || !['https:', 'http:'].includes(parsed.protocol)) throw new Error('APP_ORIGIN deve ser uma origem exata.');
 const production = process.env.NODE_ENV === 'production';
 if (production && parsed.protocol !== 'https:') throw new Error('Produção exige APP_ORIGIN HTTPS.');
 const sessionDays = Number(process.env.SESSION_DAYS ?? '7');
 const port = Number(process.env.PORT ?? '3000');
 if (!Number.isInteger(sessionDays) || sessionDays < 1 || sessionDays > 30) throw new Error('SESSION_DAYS deve estar entre 1 e 30.');
 if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
 const databaseUrl = process.env.DATABASE_URL ?? '';
 if (!databaseUrl) throw new Error('Defina DATABASE_URL.');
 const values = [process.env.R2_ACCOUNT_ID, process.env.R2_BUCKET, process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY];
 let storage: StorageSettings | undefined;
 if (values.some(v => !!v)) {
  if (values.some(v => !v)) throw new Error('Preencha as quatro variáveis R2 ou deixe todas vazias.');
  const [accountId, bucket, accessKeyId, secretAccessKey] = values as string[];
  if (!/^[a-f0-9]{32}$/i.test(accountId) || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) throw new Error('Conta ou bucket R2 inválido.');
  storage = { accountId, bucket, accessKeyId, secretAccessKey };
 }
 return { origin, production, databaseUrl, sessionDays, port, storage };
}
export const SETTINGS = Symbol('SETTINGS');
export const DATABASE = Symbol('DATABASE');
