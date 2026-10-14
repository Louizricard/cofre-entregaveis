import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'node:crypto';
export const MAILER = Symbol('MAILER');
export interface IdentityMailer { send(to: string, code: string, id: string): Promise<void> }
export function codeHash(secret: string, id: string, sessionId: string, code: string) {
 return createHmac('sha256', Buffer.from(secret, 'hex')).update(`cofre-identity:${id}:${sessionId}:${code}`).digest('hex');
}
const encryptionKey = (secret: string) => createHash('sha256').update('cofre-identity-encryption:').update(Buffer.from(secret, 'hex')).digest();
export function encryptCode(secret: string, id: string, code: string) {
 const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
 cipher.setAAD(Buffer.from(id));
 const encrypted = Buffer.concat([cipher.update(code, 'utf8'), cipher.final()]);
 return [iv, cipher.getAuthTag(), encrypted].map(v => v.toString('base64')).join('.');
}
export function decryptCode(secret: string, id: string, value: string) {
 const [iv, tag, encrypted] = value.split('.').map(v => Buffer.from(v, 'base64'));
 if (!iv || iv.length !== 12 || !tag || tag.length !== 16 || !encrypted || encrypted.length !== 6) throw new Error('IDENTITY_CIPHER_INVALID');
 const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), iv);
 decipher.setAAD(Buffer.from(id)); decipher.setAuthTag(tag);
 const code = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
 if (!/^\d{6}$/.test(code)) throw new Error('IDENTITY_CODE_INVALID');
 return code;
}
export class ResendIdentityMailer implements IdentityMailer {
 constructor(private readonly apiKey: string, private readonly from: string, private readonly transport: typeof fetch = fetch) {}
 async send(to: string, code: string, id: string) {
  const response = await this.transport('https://api.resend.com/emails', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
   headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'cofre-identity/' + id },
   body: JSON.stringify({ from: this.from, to: [to], subject: 'Seu código de confirmação no Cofre',
    text: `Seu código de confirmação é ${code}. Ele expira em até 10 minutos e só funciona na sessão em que foi solicitado. Não compartilhe este código. Se não solicitou, ignore este e-mail.` }) });
  await response.body?.cancel();
  if (!response.ok) throw new Error('IDENTITY_DELIVERY_FAILED');
 }
}
