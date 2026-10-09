import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const raw = process.env.TEST_DATABASE_URL;
if (!raw) throw new Error('Defina TEST_DATABASE_URL para PostgreSQL exclusivo de teste (localhost:5433/cofre_test).');
const url = new URL(raw);
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.port !== '5433' || url.pathname !== '/cofre_test') {
 throw new Error('Recusado: teste aceita apenas localhost:5433/cofre_test. Nunca use DATABASE_URL de desenvolvimento.');
}
url.searchParams.set('schema', 'cofre_test_' + randomUUID().replaceAll('-', ''));
const env = { ...process.env, DATABASE_URL: url.href, TEST_DATABASE_URL: url.href, COFRE_INTEGRATION: '1', NODE_ENV: 'test' };
const cli = process.env.npm_execpath;
if (!cli) throw new Error('Execute com pnpm test:integration.');
function run(args) {
 const result = spawnSync(process.execPath, [cli, ...args], { stdio: 'inherit', env });
 if (result.status !== 0) process.exit(result.status ?? 1);
}
run(['db:generate']);
run(['db:migrate']);
run(['build']);
const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', 'apps/api/dist/test/auth.integration.js', 'apps/api/dist/test/work.integration.js'], { stdio: 'inherit', env });
console.log('Schema isolado de teste preservado: ' + url.searchParams.get('schema'));
process.exit(result.status ?? 1);
