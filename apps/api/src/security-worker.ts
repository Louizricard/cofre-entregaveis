import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import type { Database } from '@cofre/database';
import type { ObjectStorage } from './storage.js';
import { serial } from './transactions.js';
export const SCAN_VALID_MS = 86400000;
export const cleanScan = (asset: { scanStatus: string; scannedAt: Date | null }) =>
 asset.scanStatus === 'CLEAN' && !!asset.scannedAt && asset.scannedAt.getTime() > Date.now() - SCAN_VALID_MS;
export async function sha256(path: string) {
 const hash = createHash('sha256');
 for await (const chunk of createReadStream(path)) hash.update(chunk);
 return hash.digest('hex');
}
export interface Scanner { scan(source: string, output: string, signal: AbortSignal): Promise<{ state: 'CLEAN' | 'REJECTED' | 'ERROR'; definitions: string | null }> }
export function parserEnvironment(output: string): NodeJS.ProcessEnv {
 const env: NodeJS.ProcessEnv = { TEMP: output, TMP: output, PYTHONUTF8: '1',
  SANDBOX_STATE_DIR: fileURLToPath(new URL('../../../../.local/sandbox-state/', import.meta.url)) };
 for (const key of ['SYSTEMROOT', 'WINDIR', 'SYSTEMDRIVE', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'PROGRAMDATA']) env[key] = process.env[key];
 return env;
}
export async function isolatedProcess(executable: string, args: string[], output: string, env: NodeJS.ProcessEnv, signal: AbortSignal) {
 await new Promise<void>((done, fail) => {
  let failed = false;
  const child = spawn(executable, args, { cwd: output, env, windowsHide: true, stdio: 'ignore', signal, timeout: 240000 });
  child.once('error', () => { failed = true; });
  child.once('close', code => !failed && code === 0 ? done() : fail(new Error('ISOLATED_PROCESS_FAILED')));
 });
}
export class ClamScanner implements Scanner {
 constructor(private readonly python: string, private readonly script: string, private readonly executable: string, private readonly database: string) {}
 async scan(source: string, output: string, signal: AbortSignal) {
  const env = { ...parserEnvironment(output), CLAMAV_SCAN: this.executable, CLAMAV_DATABASE: this.database };
  await isolatedProcess(this.python, ['-I', '-B', this.script, source, output], output, env, signal);
  const resultPath = join(output, 'scan-result.json');
  if ((await stat(resultPath)).size > 2048) throw new Error('SCAN_RESULT_INVALID');
  const result = JSON.parse(await readFile(resultPath, 'utf8')) as { state: 'CLEAN' | 'REJECTED' | 'ERROR'; definitions: string | null };
  if (!['CLEAN', 'REJECTED', 'ERROR'].includes(result.state) || (result.state !== 'ERROR' && !/^\d{1,10}$/.test(result.definitions ?? ''))) throw new Error('SCAN_RESULT_INVALID');
  return result;
 }
}
export class SecurityWorker {
 constructor(private readonly db: Database, private readonly store: ObjectStorage, private readonly scanner: Scanner) {}
 async tick() {
  // Every validated original, including ZIP and already processed assets, must be scanned.
  await this.db.asset.updateMany({ where: { status: 'READY', scanStatus: 'CLEAN', scannedAt: { lt: new Date(Date.now() - SCAN_VALID_MS) } },
   data: { scanStatus: 'PENDING', scanAttempts: 0, scanRetryAt: new Date() } });
  await this.db.asset.updateMany({ where: { scanStatus: 'RUNNING', scanAttempts: { gte: 3 }, scanLeaseUntil: { lt: new Date() } },
   data: { scanStatus: 'ERROR', scanLeaseToken: null, scanLeaseUntil: null } });
  const claim = await serial(this.db, async tx => {
   const asset = await tx.asset.findFirst({ where: { status: 'READY', version: { project: { status: 'ACTIVE' } }, scanAttempts: { lt: 3 }, OR: [
    { scanStatus: { in: ['PENDING', 'ERROR'] }, scanRetryAt: { lte: new Date() } },
    { scanStatus: 'RUNNING', scanLeaseUntil: { lt: new Date() } },
   ] }, orderBy: { createdAt: 'asc' } });
   if (!asset) return null;
   const token = randomUUID();
   await tx.asset.update({ where: { id: asset.id }, data: { scanStatus: 'RUNNING', scanAttempts: { increment: 1 }, scanLeaseToken: token, scanLeaseUntil: new Date(Date.now() + 480000) } });
   return { asset, token };
  });
  if (!claim) return false;
  const { asset, token } = claim; let folder: string | undefined;
  try {
   const scratch = join(tmpdir(), 'cofre-security'); await mkdir(scratch, { recursive: true });
   for (const entry of await readdir(scratch, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.isSymbolicLink() || !/^run-[A-Za-z0-9]{6}$/.test(entry.name)) continue;
    const path = join(scratch, entry.name);
    if ((await stat(path)).mtimeMs < Date.now() - 3600000) await rm(path, { recursive: true, force: true });
   }
   folder = await mkdtemp(join(scratch, 'run-')); const input = join(folder, 'input'); const output = join(folder, 'out'); await mkdir(output);
   const signal = AbortSignal.timeout(240000);
   if (!this.store.readToFile) throw new Error('SCAN_STORAGE_UNAVAILABLE');
   await this.store.readToFile(asset.objectKey, input, Number(asset.sizeBytes), signal);
   const hash = await sha256(input);
   const result = await this.scanner.scan(input, output, signal);
   await this.db.asset.updateMany({ where: { id: asset.id, scanLeaseToken: token, scanStatus: 'RUNNING' }, data: {
    scanStatus: result.state, scannedAt: result.state === 'CLEAN' ? new Date() : null, scanSha256: result.state === 'CLEAN' ? hash : null,
    scanDefinitions: result.definitions, scanLeaseToken: null, scanLeaseUntil: null, scanRetryAt: new Date(Date.now() + 60000) } });
  } catch {
   await this.db.asset.updateMany({ where: { id: asset.id, scanLeaseToken: token }, data: { scanStatus: 'ERROR', scannedAt: null, scanSha256: null,
    scanLeaseToken: null, scanLeaseUntil: null, scanRetryAt: new Date(Date.now() + 60000) } });
  } finally { if (folder) await rm(folder, { recursive: true, force: true }).catch(() => undefined); }
  return true;
 }
}
