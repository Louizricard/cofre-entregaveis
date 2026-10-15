import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { inspectPixSandbox, pixSpikeSettings } from './pix-spike.js';
// Explicit opt-in, independent of .env and the development database.
config({ path: fileURLToPath(new URL('../../../../.local/pix-spike.env', import.meta.url)), quiet: true });
try {
 await inspectPixSandbox(pixSpikeSettings(process.env));
 console.log('Pré-validação passou: credencial corresponde ao usuário brasileiro de TESTE esperado. Somente leitura; nenhum Pix criado. OAuth, cobrança e webhook ainda precisam de validação.');
} catch (error) {
 console.error(error instanceof Error ? error.message : 'Pré-validação de sandbox falhou.');
 process.exitCode = 1;
}
