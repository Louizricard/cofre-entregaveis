import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Database, Prisma } from '@cofre/database';
import { DATABASE } from './config.js';
import { IdentityService } from './identity.service.js';
import type { GuestRequest } from './sharing.service.js';
import { serial } from './transactions.js';
import type { DecideRevisionDto, RequestRevisionDto } from './revisions.dto.js';
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
const conflict = (message: string) => new ConflictException({ code: 'REVISION_CONFLICT', message });
type Round = Prisma.RevisionRoundGetPayload<{ include: { version: true } }>;
const view = (r: Round) => ({ id: r.id, versionId: r.versionId, versionNumber: r.version.number, summary: r.summary, state: r.state, extra: r.extra,
 commentCount: Array.isArray(r.commentIds) ? r.commentIds.length : 0, decisionReason: r.decisionReason, createdAt: r.createdAt, decidedAt: r.decidedAt, resolvedAt: r.resolvedAt });
@Injectable()
export class RevisionsService {
 constructor(@Inject(DATABASE) private readonly db: Database, private readonly identity: IdentityService) {}
 private async list(tx: Prisma.TransactionClient, workspaceId: string, projectId: string, guest: boolean) {
  const project = await tx.project.findFirst({ where: { id: projectId, workspaceId } }); if (!project) throw missing();
  const current = await tx.projectVersion.findFirst({ where: { projectId, state: 'PUBLISHED' } });
  const items = await tx.revisionRound.findMany({ where: { projectId, workspaceId }, include: { version: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  return { items: items.map(view), included: project.includedRevisionRounds, used: items.filter(r => ['OPEN', 'RESOLVED'].includes(r.state)).length,
   currentVersionId: current?.id ?? null, canRequest: guest && project.status === 'ACTIVE' && !!current && items.length < 100 && !items.some(r => ['OPEN', 'PENDING'].includes(r.state)) };
 }
 async creator(workspaceId: string, projectId: string) { return serial(this.db, tx => this.list(tx, workspaceId, projectId, false)); }
 async guest(req: GuestRequest) { return serial(this.db, async tx => { const { session } = await this.identity.confirmed(req, tx); return this.list(tx, session.share.workspaceId, session.share.projectId, true); }); }
 async request(req: GuestRequest, key: string, dto: RequestRevisionDto) {
  return serial(this.db, async tx => {
   const { session, email } = await this.identity.confirmed(req, tx);
   const hash = createHash('sha256').update(JSON.stringify({ versionId: dto.versionId, summary: dto.summary })).digest('hex');
   const previous = await tx.revisionRound.findUnique({ where: { guestSessionId_requestKey: { guestSessionId: session.id, requestKey: key } }, include: { version: true } });
   if (previous) { if (previous.payloadHash !== hash) throw conflict('Esta tentativa já foi usada para outro pedido.'); return view(previous); }
   const version = await tx.projectVersion.findFirst({ where: { id: dto.versionId, workspaceId: session.share.workspaceId, projectId: session.share.projectId, state: { in: ['PUBLISHED', 'SUPERSEDED'] } }, include: { project: true } });
   if (!version) throw missing();
   const state = await this.list(tx, version.workspaceId, version.projectId, true);
   if (!state.canRequest || version.state !== 'PUBLISHED') throw conflict('Peça ajustes somente na versão atual, sem outro pedido em andamento. Atualize o projeto.');
   const extra = state.used >= state.included;
   const comments = await tx.comment.findMany({ where: { workspaceId: version.workspaceId, versionId: version.id }, select: { id: true }, orderBy: { id: 'asc' } });
   await tx.project.update({ where: { id: version.projectId }, data: { revision: { increment: 1 } } });
   return view(await tx.revisionRound.create({ data: { workspaceId: version.workspaceId, projectId: version.projectId, versionId: version.id,
    guestSessionId: session.id, requestKey: key, payloadHash: hash, authorEmail: email, summary: dto.summary, commentIds: comments.map(c => c.id), extra, state: extra ? 'PENDING' : 'OPEN' }, include: { version: true } }));
  });
 }
 async decide(workspaceId: string, userId: string, id: string, dto: DecideRevisionDto) {
  return serial(this.db, async tx => {
   const r = await tx.revisionRound.findFirst({ where: { id, workspaceId }, include: { project: true, version: true } }); if (!r) throw missing();
   const state = dto.decision === 'ACCEPT' ? 'OPEN' : 'REJECTED';
   if (r.state === state && r.decidedById === userId && r.decisionReason === dto.reason) return view(r);
   if (r.state !== 'PENDING' || r.project.status !== 'ACTIVE' || r.version.state !== 'PUBLISHED') throw conflict('Este pedido já foi decidido ou pertence a uma versão anterior. Atualize o projeto.');
   await tx.project.update({ where: { id: r.projectId }, data: { revision: { increment: 1 } } });
   return view(await tx.revisionRound.update({ where: { id }, data: { state, decidedById: userId, decidedAt: new Date(), decisionReason: dto.reason }, include: { version: true } }));
  });
 }
}
