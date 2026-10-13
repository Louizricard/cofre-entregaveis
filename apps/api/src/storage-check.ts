import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { settings } from './config.js';
import { PART_SIZE } from './file-types.js';
import { R2Storage } from './storage.js';

// Explicit opt-in command. No real user files or application records are used.
async function check() {
 const config = settings();
 if (!config.storage) throw new Error('Configure as quatro variáveis R2 no .env.');
 const storage = new R2Storage(config.storage);
 const local = fileURLToPath(new URL('../../../../.local/', import.meta.url));
 const stateFile = local + '/r2-smoke-state.json';
 const request = (url: string, options: RequestInit = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(30000) });
 let key = ''; let uploadId: string | null = null;
 try {
  await mkdir(local, { recursive: true });
  try {
   const old = JSON.parse(await readFile(stateFile, 'utf8')) as { key: string; uploadId: string | null; bucket: string };
   if (!/^cofre-smoke\/[0-9a-f-]{36}$/.test(old.key) || old.bucket !== config.storage.bucket) throw new Error('Inspecione o registro local de smoke anterior.');
   await storage.cleanup(old.key, old.uploadId); await unlink(stateFile);
  } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; }
  const assetId = randomUUID(); key = 'cofre-smoke/' + assetId;
  await writeFile(stateFile, JSON.stringify({ key, uploadId, bucket: config.storage.bucket }));
  uploadId = await storage.create(key, 'application/octet-stream', assetId);
  await writeFile(stateFile, JSON.stringify({ key, uploadId, bucket: config.storage.bucket }));
  const parts = [Buffer.alloc(PART_SIZE, 65), Buffer.from('cofre-smoke-final')];
  const etags: { partNumber: number; etag: string }[] = [];
  for (const [i, body] of parts.entries()) {
   const url = await storage.signPart(key, uploadId, i + 1, body.length);
   const preflight = await request(url, { method: 'OPTIONS', headers: { Origin: config.origin, 'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'content-type' } });
   assert.ok(preflight.ok, 'CORS preflight'); assert.equal(preflight.headers.get('access-control-allow-origin'), config.origin, 'CORS origin');
   if (i === 1) {
    const invalid = await request(url, { method: 'PUT', body: Buffer.alloc(body.length + 1), headers: { Origin: config.origin } });
    assert.ok(!invalid.ok, 'R2 precisa recusar tamanho diferente do assinado');
   }
   const put = await request(url, { method: 'PUT', body, headers: { Origin: config.origin, 'Content-Type': 'application/octet-stream' } });
   assert.ok(put.ok, 'UploadPart'); assert.equal(put.headers.get('access-control-allow-origin'), config.origin);
   assert.ok(put.headers.get('access-control-expose-headers')?.toLowerCase().includes('etag'), 'ETag exposto por CORS');
   assert.ok(put.headers.get('etag')); etags.push({ partNumber: i + 1, etag: put.headers.get('etag')! });
  }
  const actual = await storage.parts(key, uploadId); assert.equal(actual.length, 2);
  assert.deepEqual(actual.map(p => p.size), parts.map(p => p.length));
  await storage.complete(key, uploadId, etags);
  const head = await storage.head(key); assert.equal(head?.size, parts[0].length + parts[1].length); assert.equal(head?.assetId, assetId);
  const download = await storage.download(key, 'verificação R2.bin');
  const range = await request(download, { headers: { Range: 'bytes=0-15', Origin: config.origin } });
  assert.equal(range.status, 206); assert.equal((await range.arrayBuffer()).byteLength, 16);
  assert.match(range.headers.get('content-disposition') ?? '', /^attachment;/);
  const unsigned = new URL(download); unsigned.search = '';
  const publicAttempt = await request(unsigned.href); assert.ok(!publicAttempt.ok, 'Objeto deve permanecer privado');
  console.log('R2: multipart, tamanho assinado, ETags/CORS, HEAD, Range, attachment e acesso privado passaram.');
 } finally {
  try {
   if (key) { await storage.cleanup(key, uploadId); await unlink(stateFile); console.log('Objeto temporário de verificação removido.'); }
  } finally { storage.close(); }
 }
}
check().catch(() => {
 console.error('Verificação R2 falhou. Confira credenciais, bucket privado, CORS e conectividade. Se existir .local/r2-smoke-state.json, o próximo check retomará a limpeza. Nenhuma credencial ou URL assinada foi registrada.');
 process.exitCode = 1;
});
