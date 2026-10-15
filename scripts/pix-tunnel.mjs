// Dedicated transport for the isolated spike. Never point this at the Cofre API/Web.
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const version = '2026.10.0';
const expectedHash = '86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c';
const binary = fileURLToPath(new URL(`../.tools/cloudflared/${version}/cloudflared.exe`, import.meta.url));
const stateFile = fileURLToPath(new URL('../.local/pix-tunnel.json', import.meta.url));
const emptyConfig = fileURLToPath(new URL('../.local/pix-cloudflared.yml', import.meta.url));
const origin = 'http://127.0.0.1:3101';
let child;
try {
 if (createHash('sha256').update(await readFile(binary)).digest('hex') !== expectedHash) throw new Error('checksum');
 const response = await fetch(origin + '/health', { redirect: 'error', signal: AbortSignal.timeout(3000) });
 const health = await response.json();
 if (!response.ok || health.service !== 'cofre-pix-isolated-receiver-v1') throw new Error('receiver');
 // Refuse a second tunnel while a previously recorded child is still alive.
 let old;
 // Windows PowerShell may write UTF-8 with BOM when marking a stopped tunnel.
 try { old = JSON.parse((await readFile(stateFile, 'utf8')).replace(/^\uFEFF/, '')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
 if (old?.pid && old.running) {
  let alive = false; try { process.kill(old.pid, 0); alive = true; } catch { /* exited */ }
  if (alive) throw new Error('running');
 }
 if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('arguments');
 if (process.argv.includes('--check')) {
  console.log('Cliente verificado por SHA-256; receptor isolado na porta 3101 confirmado. Nenhum túnel aberto.');
 } else {
 await writeFile(emptyConfig, '{}\n', { mode: 0o600 });
 const childEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => !/^(TUNNEL_|CLOUDFLARE_|CF_|NO_TLS_VERIFY|NO_AUTOUPDATE)/i.test(key)));
 child = spawn(binary, ['tunnel', '--config', emptyConfig, '--no-autoupdate', '--url', origin, '--metrics', '127.0.0.1:0', '--management-diagnostics=false', '--protocol', 'http2', '--loglevel', 'info'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv });
 let publicUrl;
 let buffer = '';
 let writeQueue = Promise.resolve();
 const timer = setTimeout(() => { if (!publicUrl) { console.error('Não foi possível obter o endereço HTTPS temporário.'); child.kill(); process.exitCode = 1; } }, 45000);
 // Drop raw client output, including any future request/query/error data.
 const consume = chunk => {
  buffer = (buffer + chunk.toString()).slice(-8192);
  const match = buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/);
  if (match && !publicUrl) {
   publicUrl = match[0]; clearTimeout(timer); buffer = '';
   writeQueue = writeQueue.then(() => writeFile(stateFile, JSON.stringify({ url: publicUrl, pid: child.pid, wrapperPid: process.pid, version, port: 3101, running: true }), { mode: 0o600 }));
   writeQueue.then(() => console.log('HTTPS temporário preparado. Endereço salvo em .local/pix-tunnel.json.'), () => { child.kill(); process.exitCode = 1; });
  }
 };
 child.stdout.on('data', consume); child.stderr.on('data', consume);
 child.on('error', () => { clearTimeout(timer); console.error('Cliente de túnel não iniciou.'); process.exitCode = 1; });
 child.on('exit', code => {
  clearTimeout(timer);
  if (publicUrl) writeQueue = writeQueue.then(() => writeFile(stateFile, JSON.stringify({ url: publicUrl, pid: child.pid, wrapperPid: process.pid, version, port: 3101, running: false }), { mode: 0o600 })).catch(() => { process.exitCode = 1; });
  if (code !== 0) process.exitCode = 1;
 });
 for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { child.kill(); });
 const lifetime = setTimeout(() => { console.log('Sessão temporária de testes encerrada após 60 minutos.'); child.kill(); }, 60 * 60 * 1000);
 lifetime.unref();
 }
} catch {
 child?.kill(); console.error('Túnel não iniciado: confira receptor isolado, checksum do cliente e processo anterior. Nenhum outro serviço foi exposto.'); process.exitCode = 1;
}
