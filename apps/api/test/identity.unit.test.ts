import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { codeHash, decryptCode, encryptCode, ResendIdentityMailer } from '../src/identity-mail.js';
test('código tem HMAC vinculado ao desafio e sessão, com cifra autenticada', () => {
 const key = randomBytes(32).toString('hex'); const cipher = encryptCode(key, 'challenge', '012345');
 assert.ok(!cipher.includes('012345')); assert.equal(decryptCode(key, 'challenge', cipher), '012345');
 assert.throws(() => decryptCode(key, 'other', cipher)); assert.throws(() => decryptCode(randomBytes(32).toString('hex'), 'challenge', cipher));
 assert.notEqual(codeHash(key, 'challenge', 'session', '012345'), codeHash(key, 'challenge', 'other', '012345'));
 assert.notEqual(codeHash(key, 'challenge', 'session', '012345'), codeHash(key, 'other', 'session', '012345'));
});
test('envio Resend usa chave de idempotência estável e não expõe erros do provedor', async () => {
 let key = ''; let payload: Record<string, unknown> = {};
 const mailer = new ResendIdentityMailer('re_test', 'cofre@example.com', async (url, init) => {
  assert.equal(url, 'https://api.resend.com/emails'); assert.equal(init?.redirect, 'error');
  key = (init?.headers as Record<string, string>)['Idempotency-Key']!; payload = JSON.parse(init!.body as string) as Record<string, unknown>;
  return new Response('provider response with secrets', { status: 403 });
 });
 await assert.rejects(mailer.send('client@example.com', '012345', 'challenge'), { message: 'IDENTITY_DELIVERY_FAILED' });
 assert.equal(key, 'cofre-identity/challenge'); assert.deepEqual(payload.to, ['client@example.com']); assert.match(payload.text as string, /012345/);
});
