import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Request } from 'express';
import * as argon2 from 'argon2';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import request from 'supertest';
import { assertMutation, cookieOptions, csrfCookie, digest, newToken, sessionCookie, validToken } from '../src/security.js';
import { settings, type Settings } from '../src/config.js';
import { RegisterDto } from '../src/dto.js';
import { passwordOptions } from '../src/auth.service.js';
import { createApp } from '../src/app.js';
const config: Settings = { origin: 'http://localhost:8080', databaseUrl: 'postgresql://unused:unused@localhost:59999/unused', production: false, sessionDays: 7, port: 3000 };
function mutation(origin?: string, cookie?: string, header?: string, json = true) {
 return { headers: { origin, 'x-csrf-token': header }, cookies: { [csrfCookie(config)]: cookie }, is: () => json } as unknown as Request;
}
test('tokens de 256 bits e hash SHA256', () => {
 const a = newToken(); const b = newToken();
 assert.equal(Buffer.from(a, 'base64url').length, 32); assert.notEqual(a, b);
 assert.equal(digest(a).length, 64); assert.notEqual(digest(a), a);
 assert.equal(validToken(a), true); assert.equal(validToken('bad'), false);
});
test('CSRF exige origem exata, JSON, cookie e header iguais', () => {
 const token = newToken();
 assert.doesNotThrow(() => assertMutation(mutation(config.origin, token, token), config));
 for (const input of [mutation(undefined, token, token), mutation('https://evil.test', token, token), mutation(config.origin, undefined, token), mutation(config.origin, token, undefined), mutation(config.origin, token, newToken()), mutation(config.origin, token, token, false)]) {
  assert.throws(() => assertMutation(input, config));
 }
});
test('cookies em produção usam Secure, HttpOnly e __Host-', () => {
 const production = { ...config, production: true };
 assert.equal(sessionCookie(production), '__Host-cofre-session');
 assert.equal(csrfCookie(production), '__Host-cofre-csrf');
 assert.deepEqual(cookieOptions(production), { httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
});
test('Argon2id verifica senha sem armazenar plaintext', async () => {
 const hash = await argon2.hash('senha-forte-de-teste', passwordOptions);
 assert.match(hash, /^\$argon2id\$/);
 assert.equal(await argon2.verify(hash, 'senha-forte-de-teste'), true);
 assert.equal(await argon2.verify(hash, 'senha-errada-de-teste'), false);
});
test('DTO normaliza email e valida limites e campos desconhecidos', async () => {
 const valid = { email: '  Criador@Example.com ', name: ' Ana ', workspaceName: ' Studio ', password: '123456789012' };
 const dto = plainToInstance(RegisterDto, valid);
 assert.equal(dto.email, 'criador@example.com'); assert.equal(dto.name, 'Ana');
 assert.equal((await validate(dto)).length, 0);
 for (const patch of [{ password: 'x'.repeat(11) }, { password: 'x'.repeat(129) }, { name: ' ' }, { workspaceName: 'x'.repeat(121) }, { email: 'x'.repeat(250) + '@example.com' }]) {
  assert.ok((await validate(plainToInstance(RegisterDto, { ...valid, ...patch }))).length > 0);
 }
});
test('health independe de banco, endpoints protegidos e erros seguros', async () => {
 const server = await createApp(config, { quiet: true });
 try {
  await request(server.app.getHttpServer()).get('/api/v1/health').expect(200, { status: 'ok' });
  const contract = await request(server.app.getHttpServer()).get('/api/v1/openapi.json').expect(200);
  assert.ok(contract.body.paths['/api/v1/auth/register']);
  for (const path of ['/auth/me', '/projects']) {
   const response = await request(server.app.getHttpServer()).get('/api/v1' + path).expect(401);
   assert.equal(response.body.error.code, 'UNAUTHORIZED'); assert.ok(response.body.requestId);
   assert.equal(response.body.stack, undefined);
  }
  await request(server.app.getHttpServer()).post('/api/v1/auth/login').send({}).expect(403);
  const csrf = await request(server.app.getHttpServer()).get('/api/v1/auth/csrf').expect(200);
  await request(server.app.getHttpServer()).post('/api/v1/auth/register')
   .set('Origin', config.origin).set('Cookie', csrf.headers['set-cookie']).set('X-CSRF-Token', csrf.body.csrfToken)
   .send({ email: 'invalid', password: 'short', unexpected: true }).expect(400);
 } finally { await server.close(); }
});
test('configuração recusa origem wildcard e expiração inválida', () => {
 const before = { ...process.env };
 try {
  process.env.DATABASE_URL = config.databaseUrl; process.env.APP_ORIGIN = '*';
  assert.throws(settings);
  process.env.APP_ORIGIN = config.origin; process.env.SESSION_DAYS = '0'; assert.throws(settings);
 } finally { process.env = before; }
});
