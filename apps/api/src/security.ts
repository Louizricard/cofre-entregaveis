import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, CookieOptions } from 'express';
import { DATABASE, SETTINGS, type Settings } from './config.js';
import type { Database } from '@cofre/database';
import type { IdentityView } from './dto.js';
export interface AuthRequest extends Request { requestId: string; identity: IdentityView; sessionId: string }
export const digest = (token: string) => createHash('sha256').update(token).digest('hex');
export const newToken = () => randomBytes(32).toString('base64url');
export const validToken = (token: unknown): token is string => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);
export const sessionCookie = (s: Settings) => s.production ? '__Host-cofre-session' : 'cofre-session';
export const csrfCookie = (s: Settings) => s.production ? '__Host-cofre-csrf' : 'cofre-csrf';
export const cookieOptions = (s: Settings): CookieOptions => ({ httpOnly: true, secure: s.production, sameSite: 'lax', path: '/' });
export function issueSession(res: Response, token: string, s: Settings) {
 res.cookie(sessionCookie(s), token, { ...cookieOptions(s), maxAge: s.sessionDays * 86400000 });
}
export function issueCsrf(req: Request, res: Response, s: Settings) {
 const existing: unknown = req.cookies?.[csrfCookie(s)];
 const token = validToken(existing) ? existing : newToken();
 res.cookie(csrfCookie(s), token, { ...cookieOptions(s), maxAge: 86400000 });
 return { csrfToken: token };
}
export function assertMutation(req: Request, s: Settings) {
 if (req.headers.origin !== s.origin) throw new ForbiddenException({ code: 'ORIGIN_REJECTED', message: 'Origem não permitida.' });
 if (!req.is('application/json')) throw new ForbiddenException({ code: 'CSRF_REJECTED', message: 'Envie JSON e proteção CSRF.' });
 const cookie: unknown = req.cookies?.[csrfCookie(s)];
 const header = req.headers['x-csrf-token'];
 if (!validToken(cookie) || !validToken(header) || !timingSafeEqual(Buffer.from(cookie), Buffer.from(header))) {
  throw new ForbiddenException({ code: 'CSRF_REJECTED', message: 'Proteção CSRF inválida. Recarregue a página.' });
 }
}
@Injectable()
export class MutationGuard implements CanActivate {
 constructor(@Inject(SETTINGS) private readonly config: Settings) {}
 canActivate(context: ExecutionContext) { assertMutation(context.switchToHttp().getRequest<Request>(), this.config); return true; }
}
@Injectable()
export class SessionGuard implements CanActivate {
 constructor(@Inject(DATABASE) private readonly db: Database, @Inject(SETTINGS) private readonly config: Settings) {}
 async canActivate(context: ExecutionContext) {
  const req = context.switchToHttp().getRequest<AuthRequest>();
  const token: unknown = req.cookies?.[sessionCookie(this.config)];
  if (!validToken(token)) throw new UnauthorizedException();
  const session = await this.db.session.findUnique({ where: { tokenHash: digest(token) },
   include: { user: { select: { id: true, name: true, email: true } }, workspace: { select: { id: true, name: true } } } });
  if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) throw new UnauthorizedException();
  const membership = await this.db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: session.workspaceId, userId: session.userId } } });
  if (!membership) throw new UnauthorizedException();
  req.identity = { user: session.user, workspace: session.workspace };
  req.sessionId = session.id;
  return true;
 }
}
