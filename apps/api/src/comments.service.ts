import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import type { Database, Prisma } from '@cofre/database';
import { createHash } from 'node:crypto';
import { DATABASE } from './config.js';
import { IdentityService } from './identity.service.js';
import type { GuestRequest } from './sharing.service.js';
import { serial } from './transactions.js';
import { cleanScan } from './security-worker.js';
import type { CreateCommentDto } from './comments.dto.js';
import type { ListQuery } from './projects.dto.js';
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
const invalid = () => new BadRequestException({ code: 'COMMENT_ANCHOR_INVALID', message: 'A posição informada não corresponde à prévia deste arquivo.' });
const view = (c: { id: string; body: string; createdAt: Date; anchorKind: string; timeMs: number | null; page: number | null; x: number | null; y: number | null }) => ({ id: c.id, body: c.body, authorLabel: 'Cliente confirmado', createdAt: c.createdAt,
 anchor: { kind: c.anchorKind, timeMs: c.timeMs, page: c.page, x: c.x, y: c.y } });
@Injectable()
export class CommentsService {
 constructor(@Inject(DATABASE) private readonly db: Database, private readonly identity: IdentityService) {}
 private async asset(tx: Prisma.TransactionClient, workspaceId: string, id: string, projectId?: string) {
  const a = await tx.asset.findFirst({ where: { id, workspaceId, status: 'READY', ...(projectId ? { version: { projectId, state: { in: ['PUBLISHED', 'SUPERSEDED'] } } } : {}) }, include: { version: { include: { project: true } } } });
  if (!a) throw missing(); return a;
 }
 private async context(tx: Prisma.TransactionClient, a: Awaited<ReturnType<CommentsService['asset']>>) {
  const manual = await tx.manualPreview.findFirst({ where: { assetId: a.id, workspaceId: a.workspaceId } });
  const source = manual ? await this.asset(tx, a.workspaceId, manual.sourceAssetId) : a;
  const job = await tx.mediaJob.findUnique({ where: { assetId: source.id }, include: { pages: { orderBy: { number: 'asc' } } } });
  const anchorTypes = ['GENERAL']; let pages = 0; let durationMs = 0;
  if (cleanScan(a) && cleanScan(source) && job?.state === 'READY' && job.pages.length) {
   if (source.mime === 'application/pdf') { anchorTypes.push('PDF_POINT'); pages = job.pages.length; }
   else if (['image/png', 'image/jpeg', 'image/webp'].includes(source.mime)) anchorTypes.push('IMAGE_POINT');
   else if (['video/mp4', 'audio/mpeg', 'audio/wav'].includes(source.mime)) { anchorTypes.push('TIME'); durationMs = job.pages[0].durationMs ?? 0; }
  }
  const closed = await tx.revisionRound.count({ where: { projectId: a.version.projectId, state: { in: ['OPEN', 'PENDING'] } } });
  const approved = await tx.approval.count({ where: { versionId: a.versionId } });
  return { canComment: !closed && !approved && a.version.state === 'PUBLISHED' && a.version.project.status === 'ACTIVE' && cleanScan(a) && cleanScan(source), anchorTypes, pages, durationMs };
 }
 private async list(tx: Prisma.TransactionClient, a: Awaited<ReturnType<CommentsService['asset']>>, query: ListQuery, guest: boolean) {
  const cursor = query.cursor ? await tx.comment.findFirst({ where: { id: query.cursor, workspaceId: a.workspaceId, assetId: a.id } }) : null;
  if (query.cursor && !cursor) throw missing();
  const limit = query.limit ?? 20;
  const rows = await tx.comment.findMany({ where: { workspaceId: a.workspaceId, assetId: a.id, ...(cursor ? { OR: [
   { createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } } ] } : {}) }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: limit + 1 });
  const context = await this.context(tx, a);
  return { ...context, canComment: guest && context.canComment, items: rows.slice(0, limit).map(view), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
 }
 async creator(workspaceId: string, id: string, query: ListQuery) { return serial(this.db, async tx => this.list(tx, await this.asset(tx, workspaceId, id), query, false)); }
 async guest(req: GuestRequest, id: string, query: ListQuery) {
  return serial(this.db, async tx => {
   const { session } = await this.identity.confirmed(req, tx);
   return this.list(tx, await this.asset(tx, session.share.workspaceId, id, session.share.projectId), query, true);
  });
 }
 async create(req: GuestRequest, dto: CreateCommentDto) {
  return serial(this.db, async tx => {
   const { session, email } = await this.identity.confirmed(req, tx);
   const a = await this.asset(tx, session.share.workspaceId, dto.assetId, session.share.projectId);
   const anchor = { kind: dto.anchor.kind, timeMs: dto.anchor.timeMs ?? null, page: dto.anchor.page ?? null, x: dto.anchor.x ?? null, y: dto.anchor.y ?? null };
   const payloadHash = createHash('sha256').update(JSON.stringify({ assetId: a.id, body: dto.body, anchor })).digest('hex');
   const previous = await tx.comment.findUnique({ where: { guestSessionId_clientRequestId: { guestSessionId: session.id, clientRequestId: dto.clientRequestId } } });
   if (previous) {
    if (previous.payloadHash !== payloadHash) throw new ConflictException({ code: 'COMMENT_REQUEST_REUSED', message: 'Esta tentativa já foi usada para outro comentário.' });
    return view(previous);
   }
   const context = await this.context(tx, a);
   if (!context.canComment) throw new ConflictException({ code: 'COMMENT_READ_ONLY', message: 'Os comentários estão fechados para esta versão. Confira se já há um pedido de ajustes ou atualize o projeto.' });
   if (!context.anchorTypes.includes(anchor.kind)) throw invalid();
   const present = [anchor.timeMs, anchor.page, anchor.x, anchor.y].map(v => v !== null);
   const expected = ({ GENERAL: [false, false, false, false], TIME: [true, false, false, false], IMAGE_POINT: [false, false, true, true], PDF_POINT: [false, true, true, true] } as Record<string, boolean[]>)[anchor.kind];
   if (!expected || expected.some((v, i) => v !== present[i])) throw invalid();
   if (anchor.kind === 'TIME' && (!context.durationMs || anchor.timeMs! > context.durationMs)) throw invalid();
   if (anchor.kind === 'PDF_POINT' && anchor.page! > context.pages) throw invalid();
   if (await tx.comment.count({ where: { workspaceId: a.workspaceId, assetId: a.id } }) >= 200 || await tx.comment.count({ where: { workspaceId: a.workspaceId, versionId: a.versionId } }) >= 1000) {
    throw new ConflictException({ code: 'COMMENT_LIMIT', message: 'Esta entrega atingiu o limite de comentários.' });
   }
   await tx.project.update({ where: { id: a.version.projectId }, data: { revision: { increment: 1 } } });
   const c = await tx.comment.create({ data: { workspaceId: a.workspaceId, versionId: a.versionId, assetId: a.id, guestSessionId: session.id,
    clientRequestId: dto.clientRequestId, payloadHash, authorEmail: email, body: dto.body, anchorKind: anchor.kind, timeMs: anchor.timeMs, page: anchor.page, x: anchor.x, y: anchor.y } });
   return view(c);
  });
 }
}
