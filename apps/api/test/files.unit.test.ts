import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesSignature, validDeclaredType } from '../src/file-types.js';
import { R2Storage } from '../src/storage.js';
test('validação de formato compara assinatura binária e extensão/MIME', () => {
 assert.ok(validDeclaredType('Foto.JPG', 'image/jpeg'));
 assert.equal(validDeclaredType('arquivo.html', 'application/pdf'), false);
 assert.ok(matchesSignature(Buffer.from('%PDF-1.7\n'), 'application/pdf'));
 assert.equal(matchesSignature(Buffer.from('<html>'), 'application/pdf'), false);
 assert.ok(matchesSignature(Buffer.from([137,80,78,71,13,10,26,10]), 'image/png'));
 assert.equal(matchesSignature(Buffer.from([137,80]), 'image/png'), false);
 assert.ok(matchesSignature(Buffer.from('RIFF0000WEBP'), 'image/webp'));
 assert.equal(matchesSignature(Buffer.from('RIFF0000WAVE'), 'image/webp'), false);
 assert.ok(matchesSignature(Buffer.from([80,75,3,4]), 'application/zip'));
});
test('URLs R2 restringem parte, tamanho e expiração; downloads usam attachment', async () => {
 const storage = new R2Storage({ accountId: 'a'.repeat(32), bucket: 'cofre-test', accessKeyId: 'test-key', secretAccessKey: 'test-secret' });
 try {
  const part = new URL(await storage.signPart('workspace/asset', 'upload-secret', 2, 17));
  assert.equal(part.protocol, 'https:'); assert.equal(part.searchParams.get('partNumber'), '2');
  assert.equal(part.searchParams.get('X-Amz-Expires'), '300');
  assert.match(part.searchParams.get('X-Amz-SignedHeaders')!, /content-length/);
  const download = new URL(await storage.download('workspace/asset', 'Foto "ação".png'));
  assert.equal(download.searchParams.get('X-Amz-Expires'), '60');
  assert.match(download.searchParams.get('response-content-disposition')!, /^attachment;/);
  assert.equal(download.searchParams.get('response-content-type'), 'application/octet-stream');
  for (const mime of ['video/mp4', 'audio/mp4']) {
   const preview = new URL(await storage.preview('previews/derived', mime));
   assert.equal(preview.searchParams.get('X-Amz-Expires'), '60');
   assert.equal(preview.searchParams.get('response-content-type'), mime);
   assert.equal(preview.searchParams.get('response-content-disposition'), 'inline');
  }
 } finally { storage.close(); }
});
