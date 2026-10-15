import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { pixSpikeSettings } from './pix-spike.js';
import { runPixOrderSpike, type PixOrderAttempt } from './pix-order-spike.js';
config({ path: fileURLToPath(new URL('../../../../.local/pix-spike.env', import.meta.url)), quiet: true });
const stateFile = fileURLToPath(new URL('../../../../.local/pix-spike-state.json', import.meta.url));
try {
 const settings = pixSpikeSettings(process.env);
 let attempt: PixOrderAttempt;
 try { attempt = JSON.parse(await readFile(stateFile, 'utf8')) as PixOrderAttempt; }
 catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Não foi possível ler a tentativa local. Preserve o arquivo para recuperação.');
  attempt = { key: randomUUID(), reference: 'cofre-spike-' + randomUUID(), userId: settings.userId, applicationId: settings.applicationId, orderId: null };
  // Persist before any request; never generate a replacement key after network failure.
  await writeFile(stateFile, JSON.stringify(attempt), { flag: 'wx', mode: 0o600 });
 }
 const result = await runPixOrderSpike(settings, attempt, async state => {
  const temporary = stateFile + '.' + randomUUID() + '.tmp';
  await writeFile(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600 });
  await rename(temporary, stateFile);
 });
 console.log(`Pix de TESTE: criação/recuperação, repetição idempotente e consulta passaram. Estado: ${result.status}; confirmação simulada conciliada: ${result.confirmed ? 'sim' : 'ainda pendente'}. Nenhum QR ou dado privado registrado.`);
 console.log('Ensaio da credencial de teste da aplicação; OAuth do vendedor, webhook, cancelamento e estorno continuam pendentes.');
} catch (error) {
 // Filesystem errors can contain paths; never print raw provider errors or payloads.
 const message = error instanceof Error && !('code' in error) ? error.message : 'Falha no arquivo local do ensaio. Preserve a tentativa para recuperação.';
 console.error(message); process.exitCode = 1;
}
