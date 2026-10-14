import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Database, Prisma } from '@cofre/database';
import type { Request, Response } from 'express';
import { DATABASE, SETTINGS, type Settings } from './config.js';
import { cookieOptions, digest, newToken, validToken } from './security.js';
import { serial } from './transactions.js';
import { MediaService } from './media.service.js';
import type { ListQuery } from './projects.dto.js';
const shareSelect = { id: true, expiresAt: true, revokedAt: true, createdAt: true } as const;
const versionSelect = { id: true, number: true, state: true } as const;
export const guestCookie = (s: Settings) => s.production ? '__Host-cofre-guest' : 'cofre-guest';
export interface GuestRequest extends Request { guestToken?: string }
const unavailable = () => new UnauthorizedException({ code: 'GUEST_ACCESS_INVALID', message: 'Acesso indisponível. Solicite um link válido ao responsável.' });
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });

@Injectable()
export class SharingService {
 constructor(@Inject(DATABASE) private readonly db: Database, @Inject(SETTINGS) private readonly config: Settings, private readonly media: MediaService) {}
 async create(workspaceId: string, projectId: string, expiresAt: string) {
  const expiry = new Date(expiresAt); const now = Date.now();
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() < now + 300000 || expiry.getTime() > now + 30 * 86400000) {
   throw new BadRequestException({ code: 'SHARE_EXPIRATION', message: 'Escolha uma expiração entre 5 minutos e 30 dias.' });
  }
  const token = newToken();
  const result = await serial(this.db, async tx => {
   const p = await tx.project.findFirst({ where: { id: projectId, workspaceId } });
   if (!p) throw missing();
   if (p.status !== 'ACTIVE') throw new ConflictException({ code: 'PROJECT_ARCHIVED', message: 'Projeto arquivado.' });
   if (!await tx.projectVersion.findFirst({ where: { projectId, state: 'PUBLISHED' } })) throw new ConflictException({ code: 'VERSION_NOT_PUBLISHED', message: 'Publique uma versão antes de compartilhar.' });
   if (await tx.shareLink.count({ where: { projectId, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 10) throw new ConflictException({ code: 'SHARE_LIMIT', message: 'Revogue um dos dez links ativos antes de criar outro.' });
   await tx.project.update({ where: { id: projectId }, data: { revision: { increment: 1 } } });
   return tx.shareLink.create({ data: { workspaceId, projectId, tokenHash: digest(token), expiresAt: expiry }, select: shareSelect });
  });
  return { ...result, url: this.config.origin + '/#/s/' + token };
 }
 async list(workspaceId: string, projectId: string, query: ListQuery) {
  if (!await this.db.project.findFirst({ where: { id: projectId, workspaceId } })) throw missing();
  if (query.cursor && !await this.db.shareLink.findFirst({ where: { id: query.cursor, projectId, workspaceId } })) throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Paginação inválida.' });
  const limit = query.limit ?? 20;
  const rows = await this.db.shareLink.findMany({ where: { projectId, workspaceId, ...(query.cursor ? { id: { gt: query.cursor } } : {}) }, orderBy: { id: 'asc' }, take: limit + 1, select: shareSelect });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
 }
 async revoke(workspaceId: string, id: string) {
  await serial(this.db, async tx => {
   const share = await tx.shareLink.findFirst({ where: { id, workspaceId } });
   if (!share) throw missing();
   if (!share.revokedAt) await tx.shareLink.update({ where: { id }, data: { revokedAt: new Date() } });
   await tx.guestSession.updateMany({ where: { shareId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  });
 }
 async access(token: unknown, tx: Prisma.TransactionClient = this.db) {
  if (!validToken(token)) throw unavailable();
  const session = await tx.guestSession.findUnique({ where: { tokenHash: digest(token) }, include: { share: { include: { project: true } } } });
  const now = Date.now();
  if (!session || session.revokedAt || session.expiresAt.getTime() <= now || session.share.revokedAt || session.share.expiresAt.getTime() <= now || session.share.project.status !== 'ACTIVE') throw unavailable();
  return session;
 }
 async bootstrap(token: string, req: GuestRequest, res: Response) {
  const freshToken = newToken();
  const expiresAt = await serial(this.db, async tx => {
   const share = await tx.shareLink.findUnique({ where: { tokenHash: digest(token) }, include: { project: true } });
   if (!share || share.revokedAt || share.expiresAt.getTime() <= Date.now() || share.project.status !== 'ACTIVE') throw unavailable();
   const existing: unknown = req.cookies?.[guestCookie(this.config)];
   if (validToken(existing)) await tx.guestSession.updateMany({ where: { tokenHash: digest(existing) }, data: { revokedAt: new Date() } });
   if (await tx.guestSession.count({ where: { shareId: share.id, revokedAt: null, expiresAt: { gt: new Date() } } }) >= 1000) throw unavailable();
   const expiresAt = new Date(Math.min(share.expiresAt.getTime(), Date.now() + 8 * 3600000));
   await tx.guestSession.create({ data: { shareId: share.id, tokenHash: digest(freshToken), expiresAt } });
   return expiresAt;
  });
  res.cookie(guestCookie(this.config), freshToken, { ...cookieOptions(this.config), maxAge: Math.max(0, expiresAt.getTime() - Date.now()) });
  return { expiresAt };
 }
 async logout(req: GuestRequest, res: Response) {
  const token: unknown = req.cookies?.[guestCookie(this.config)];
  if (validToken(token)) await this.db.guestSession.updateMany({ where: { tokenHash: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
  res.clearCookie(guestCookie(this.config), cookieOptions(this.config));
 }
 async project(req: GuestRequest) {
  const session = await this.access(req.cookies?.[guestCookie(this.config)]);
  const p = session.share.project;
  const currentVersion = await this.db.projectVersion.findFirst({ where: { workspaceId: p.workspaceId, projectId: p.id, state: 'PUBLISHED' }, select: versionSelect });
  if (!currentVersion) throw unavailable();
  return { title: p.title, balanceCents: p.balanceCents, currency: p.currency, currentVersion };
 }
 async versions(req: GuestRequest, query: ListQuery) {
  const session = await this.access(req.cookies?.[guestCookie(this.config)]);
  const where = { workspaceId: session.share.workspaceId, projectId: session.share.projectId, state: { in: ['PUBLISHED', 'SUPERSEDED'] as ('PUBLISHED' | 'SUPERSEDED')[] } };
  const cursor = query.cursor ? await this.db.projectVersion.findFirst({ where: { ...where, id: query.cursor } }) : null;
  if (query.cursor && !cursor) throw missing();
  const limit = query.limit ?? 20;
  const rows = await this.db.projectVersion.findMany({ where: { ...where, ...(cursor ? { number: { lt: cursor.number } } : {}) }, orderBy: { number: 'desc' }, take: limit + 1, select: versionSelect });
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
 }
 async version(req: GuestRequest, id: string) {
  const session = await this.access(req.cookies?.[guestCookie(this.config)]);
  const v = await this.db.projectVersion.findFirst({ where: { id, workspaceId: session.share.workspaceId, projectId: session.share.projectId, state: { in: ['PUBLISHED', 'SUPERSEDED'] } }, select: { ...versionSelect,
   assets: { where: { status: 'READY' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true, fileName: true, mime: true, sizeBytes: true } } } });
  if (!v) throw missing();
  return { ...v, assets: v.assets.map(a => ({ ...a, sizeBytes: a.sizeBytes.toString() })) };
 }
 private async asset(req: GuestRequest, id: string) {
  const session = await this.access(req.cookies?.[guestCookie(this.config)]);
  const asset = await this.db.asset.findFirst({ where: { id, workspaceId: session.share.workspaceId, status: 'READY', version: { projectId: session.share.projectId, state: { in: ['PUBLISHED', 'SUPERSEDED'] } } }, select: { id: true, workspaceId: true } });
  if (!asset) throw missing();
  return asset;
 }
 async status(req: GuestRequest, id: string) {
  const a = await this.asset(req, id); return this.media.state(a.workspaceId, a.id);
 }
 async preview(req: GuestRequest, id: string, page: number) {
  const a = await this.asset(req, id);
  const preview = await this.media.preview(a.workspaceId, a.id, page);
  await this.asset(req, id); // Revalidate revocation/archive before returning the signed derivative URL.
  return preview;
 }
}
