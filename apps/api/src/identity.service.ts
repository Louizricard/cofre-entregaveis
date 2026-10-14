import { BadRequestException, ForbiddenException, Inject, Injectable, ServiceUnavailableException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Database, Prisma } from '@cofre/database';
import { DATABASE, SETTINGS, type Settings } from './config.js';
import { MAINTENANCE } from './files.service.js';
import { SharingService, guestCookie, type GuestRequest } from './sharing.service.js';
import { serial } from './transactions.js';
import { codeHash, decryptCode, encryptCode, MAILER, type IdentityMailer } from './identity-mail.js';
const invalid = () => new BadRequestException({ code: 'IDENTITY_CODE_INVALID', message: 'Código inválido ou expirado. Solicite outro código se necessário.' });
@Injectable()
export class IdentityService implements OnModuleInit, OnModuleDestroy {
 private timer?: NodeJS.Timeout;
 private task?: Promise<unknown>;
 constructor(@Inject(DATABASE) private readonly db: Database, @Inject(SETTINGS) private readonly config: Settings,
  @Inject(MAILER) private readonly mailer: IdentityMailer | null, @Inject(MAINTENANCE) private readonly maintenance: boolean,
  private readonly sharing: SharingService) {}
 onModuleInit() {
  if (this.maintenance && this.enabled()) {
   this.timer = setInterval(() => { if (!this.task) this.task = this.deliverOnce().catch(() => undefined).finally(() => { this.task = undefined; }); }, 2000);
   this.timer.unref();
  }
 }
 async onModuleDestroy() { if (this.timer) clearInterval(this.timer); await this.task; }
 private enabled() { return !!this.mailer && !!this.config.email; }
 private async access(req: GuestRequest, tx: Prisma.TransactionClient = this.db) {
  const session = await this.sharing.access(req.cookies?.[guestCookie(this.config)], tx);
  const client = await tx.client.findFirstOrThrow({ where: { id: session.share.project.clientId, workspaceId: session.share.workspaceId } });
  return { session, email: client.email };
 }
 async confirmed(req: GuestRequest, tx: Prisma.TransactionClient = this.db) {
  const access = await this.access(req, tx);
  if (!access.session.verifiedAt || access.session.verifiedEmail !== access.email) throw new ForbiddenException({ code: 'IDENTITY_REQUIRED', message: 'Confirme seu e-mail no portal para acessar os comentários.' });
  return access;
 }
 async status(req: GuestRequest) {
  const { session, email } = await this.access(req);
  return { enabled: this.enabled(), verified: !!session.verifiedAt && session.verifiedEmail === email };
 }
 async request(req: GuestRequest, email: string) {
  // Generic response for matching, nonmatching, cooldown and quota; no provider I/O in this request.
  await serial(this.db, async tx => {
   const access = await this.access(req, tx); const { session } = access;
   if (!this.enabled()) throw new ServiceUnavailableException({ code: 'IDENTITY_NOT_CONFIGURED', message: 'A confirmação por e-mail ainda não está disponível. As prévias continuam acessíveis.' });
   const now = new Date();
   const recent = await tx.identityRequest.count({ where: { sessionId: session.id, createdAt: { gt: new Date(Date.now() - 60000) } } });
   const projectRequests = await tx.identityRequest.count({ where: { createdAt: { gt: new Date(Date.now() - 3600000) }, session: { share: { projectId: session.share.projectId } } } });
   if (recent || projectRequests >= 10 || (session.verifiedAt && session.verifiedEmail === access.email)) return;
   await tx.identityRequest.create({ data: { sessionId: session.id } });
   // Serialize quotas across links/sessions without changing the delivery revision of the project.
   await tx.guestSession.update({ where: { id: session.id }, data: { verifiedAt: session.verifiedAt } });
   if (email !== access.email) return;
   const id = randomUUID(); const secret = this.config.email!.identityKey;
   const previous = await tx.identityChallenge.findUnique({ where: { sessionId: session.id } });
   let code: string;
   do { code = randomInt(0, 1000000).toString().padStart(6, '0'); }
   while (previous && codeHash(secret, previous.id, session.id, code) === previous.codeHash);
   await tx.identityChallenge.deleteMany({ where: { sessionId: session.id } });
   await tx.identityChallenge.create({ data: { id, sessionId: session.id, email, codeHash: codeHash(secret, id, session.id, code),
    encryptedCode: encryptCode(secret, id, code), expiresAt: new Date(Math.min(now.getTime() + 600000, session.expiresAt.getTime(), session.share.expiresAt.getTime())) } });
  });
  return { message: 'Se o e-mail corresponder ao cadastro do projeto, você receberá um código. Aguarde um minuto antes de solicitar outro.' };
 }
 async verify(req: GuestRequest, code: string) {
  const ok = await serial(this.db, async tx => {
   const { session, email } = await this.access(req, tx);
   const challenge = await tx.identityChallenge.findUnique({ where: { sessionId: session.id } });
   if (!challenge || challenge.consumedAt || challenge.expiresAt.getTime() <= Date.now() || challenge.attempts >= 5 || !this.config.email) return false;
   const expected = codeHash(this.config.email.identityKey, challenge.id, session.id, code);
   const valid = challenge.deliveryState === 'SENT' && challenge.email === email && timingSafeEqual(Buffer.from(expected), Buffer.from(challenge.codeHash));
   const attempts = challenge.attempts + 1;
   await tx.identityChallenge.update({ where: { id: challenge.id }, data: { attempts,
    ...(valid || attempts >= 5 ? { consumedAt: new Date(), encryptedCode: null } : {}),
    ...(!valid && attempts >= 5 ? { deliveryState: 'CANCELLED', leaseToken: null, leaseUntil: null } : {}) } });
   if (valid) await tx.guestSession.update({ where: { id: session.id }, data: { verifiedAt: new Date(), verifiedEmail: email } });
   return valid;
  });
  if (!ok) throw invalid();
  return { enabled: this.enabled(), verified: true };
 }
 async deliverOnce() {
  if (!this.enabled()) return false;
  const now = new Date();
  await this.db.identityChallenge.updateMany({ where: { deliveryState: { in: ['PENDING', 'RUNNING'] }, OR: [{ expiresAt: { lte: now } }, { consumedAt: { not: null } }, { deliveryState: 'RUNNING', deliveryAttempts: { gte: 3 }, leaseUntil: { lt: now } }] },
   data: { encryptedCode: null, deliveryState: 'CANCELLED', leaseToken: null, leaseUntil: null } });
  const claim = await serial(this.db, async tx => {
   const c = await tx.identityChallenge.findFirst({ where: { consumedAt: null, expiresAt: { gt: now }, encryptedCode: { not: null }, deliveryAttempts: { lt: 3 }, OR: [
    { deliveryState: 'PENDING', nextAttemptAt: { lte: now } }, { deliveryState: 'RUNNING', leaseUntil: { lt: now } } ] }, orderBy: { createdAt: 'asc' },
    include: { session: { include: { share: { include: { project: { include: { client: true } } } } } } } });
   if (!c) return null;
   const { session } = c; const { share } = session;
   if (session.revokedAt || session.expiresAt <= now || share.revokedAt || share.expiresAt <= now || share.project.status !== 'ACTIVE' || share.project.client.email !== c.email) {
    await tx.identityChallenge.update({ where: { id: c.id }, data: { deliveryState: 'CANCELLED', encryptedCode: null, leaseToken: null, leaseUntil: null } }); return null;
   }
   const token = randomUUID();
   await tx.identityChallenge.update({ where: { id: c.id }, data: { deliveryState: 'RUNNING', deliveryAttempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(Date.now() + 180000) } });
   return { c, token };
  });
  if (!claim) return false;
  const { c, token } = claim;
  try {
   const code = decryptCode(this.config.email!.identityKey, c.id, c.encryptedCode!);
   await this.mailer!.send(c.email, code, c.id);
   await this.db.identityChallenge.updateMany({ where: { id: c.id, leaseToken: token, deliveryState: 'RUNNING' }, data: { deliveryState: 'SENT', encryptedCode: null, leaseToken: null, leaseUntil: null } });
  } catch {
   const exhausted = c.deliveryAttempts + 1 >= 3;
   await this.db.identityChallenge.updateMany({ where: { id: c.id, leaseToken: token, deliveryState: 'RUNNING' }, data: { deliveryState: exhausted ? 'FAILED' : 'PENDING',
    ...(exhausted ? { encryptedCode: null } : {}), leaseToken: null, leaseUntil: null, nextAttemptAt: new Date(Date.now() + 30000 * (c.deliveryAttempts + 1)) } });
  }
  return true;
 }
}
