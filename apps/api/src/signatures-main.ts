import { spawnSync } from 'node:child_process';
import { closeSync, openSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { settings } from './config.js';
import { parserEnvironment } from './security-worker.js';
settings();
const scanner = process.env.CLAMAV_SCAN; const database = process.env.CLAMAV_DATABASE;
if (!scanner || !database || !isAbsolute(scanner) || !isAbsolute(database) || /[\r\n"]/.test(database)) throw new Error('Configure caminhos absolutos para o ClamAV e a pasta dedicada de assinaturas.');
const folder = fileURLToPath(new URL('../../../../.local/', import.meta.url)); await mkdir(folder, { recursive: true });
const config = join(folder, 'freshclam-generated.conf');
await writeFile(config, `DatabaseDirectory ${database.replaceAll('\\', '/')}\nDatabaseMirror database.clamav.net\n`);
const log = openSync(join(folder, 'signatures-update.log'), 'w');
const nativeDatabase = process.platform === 'win32' ? database.replaceAll('/', '\\') : database;
const result = spawnSync(join(dirname(scanner), process.platform === 'win32' ? 'freshclam.exe' : 'freshclam'), ['--config-file', config, '--datadir', nativeDatabase, '--quiet'],
 { env: { ...parserEnvironment(folder), PATH: dirname(scanner) + (process.platform === 'win32' ? ';' + process.env.SYSTEMROOT + '/System32' : ':/usr/bin:/bin') },
  stdio: ['ignore', log, log], windowsHide: true, timeout: 300000 });
closeSync(log);
if (result.status !== 0) { console.error('Não foi possível atualizar as assinaturas oficiais. Arquivos sem análise válida permanecem bloqueados.'); process.exitCode = 1; }
else console.log('Assinaturas oficiais do ClamAV atualizadas. Nenhum arquivo de usuário foi enviado.');
