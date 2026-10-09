import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createApp } from './app.js';
const server = await createApp({ databaseUrl: 'postgresql://unused:unused@localhost:5432/unused', origin: 'http://localhost:8080', production: false, port: 3000, sessionDays: 7 }, { quiet: true });
try {
 const file = 'packages/contracts/openapi.json';
 const output = JSON.stringify(server.document, null, 2) + '\n';
 if (process.argv.includes('--check')) {
  if (readFileSync(file, 'utf8') !== output) throw new Error('OpenAPI desatualizado; execute pnpm contracts:generate.');
 } else {
  mkdirSync('packages/contracts', { recursive: true });
  writeFileSync(file, output);
 }
} finally { await server.close(); }
