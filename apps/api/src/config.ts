import { config as dotenv } from 'dotenv';
import { fileURLToPath } from 'node:url';
dotenv({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });
// Source tooling and compiled entrypoints also accept environment variables directly.
export interface Settings { databaseUrl: string; origin: string; production: boolean; sessionDays: number; port: number }
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
 return { origin, production, databaseUrl, sessionDays, port };
}
export const SETTINGS = Symbol('SETTINGS');
export const DATABASE = Symbol('DATABASE');
