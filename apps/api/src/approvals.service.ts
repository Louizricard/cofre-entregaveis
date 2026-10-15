import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Database, Prisma } from '@cofre/database';
import { DATABASE } from './config.js';
import { IdentityService } from './identity.service.js';
import type { GuestRequest } from './sharing.service.js';
import { serial } from './transactions.js';
import { cleanScan } from './security-worker.js';
import { previewSupported } from './media.service.js';
import type { CreateApprovalDto } from './approvals.dto.js';
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
const conflict = (message: string) => new ConflictException({ code: 'APPROVAL_CONFLICT', message });
const view = (a: { id: string; versionId: string; createdAt: Date }) => ({ id: a.id, versionId: a.versionId, authorLabel: 'Cliente confirmado', approvedAt: a.createdAt });
@Injectable()
export class ApprovalsService {
 constructor(@Inject(DATABASE) private readonly db: Database, private readonly identity: IdentityService) {}
 private async version(tx: Prisma.TransactionClient, workspaceId: string, id: string, projectId?: string) {
  const v = await tx.projectVersion.findFirst({ where: { id, workspaceId, ...(projectId ? { projectId, state: { in: ['PUBLISHED', 'SUPERSEDED'] } } : {}) },
   include: { project: true, approvals: true, assets: { include: { mediaJob: true } } } });
  if (!v) throw missing(); return v;
 }
 private async reason(tx: Prisma.TransactionClient, v: Awaited<ReturnType<ApprovalsService['version']>>) {
  if (v.project.status !== 'ACTIVE') return 'Projeto arquivado.';
  if (v.state !== 'PUBLISHED') return 'Aprovação disponível somente para a versão publicada atual.';
  if (await tx.revisionRound.count({ where: { projectId: v.projectId, state: { in: ['OPEN', 'PENDING'] } } })) return 'Há um pedido de ajustes em andamento. Aguarde a nova versão ou a decisão do criador.';
  if (v.assets.some(a => !['READY', 'ABORTED', 'FAILED'].includes(a.status))) return 'Aguarde a conclusão dos arquivos.';
  const files = v.assets.filter(a => a.status === 'READY');
  if (!files.length || files.some(a => !cleanScan(a))) return 'Aguarde a análise de segurança dos arquivos.';
  if (files.some(a => previewSupported(a.mime) && a.mediaJob?.state !== 'READY')) return 'Aguarde as prévias dos arquivos.';
  return null;
 }
 private async status(tx: Prisma.TransactionClient, v: Awaited<ReturnType<ApprovalsService['version']>>, guest: boolean) {
  const approval = v.approvals[0]; const reason = approval ? null : await this.reason(tx, v);
  return { versionId: v.id, versionNumber: v.number, versionState: v.state, approval: approval ? view(approval) : null,
   canApprove: guest && !approval && reason === null, reason: reason ?? (!approval && !guest ? 'Aguardando a confirmação do cliente no portal.' : null) };
 }
 async creator(workspaceId: string, id: string) { return serial(this.db, async tx => this.status(tx, await this.version(tx, workspaceId, id), false)); }
 async guest(req: GuestRequest, id: string) {
  return serial(this.db, async tx => { const { session } = await this.identity.confirmed(req, tx);
   return this.status(tx, await this.version(tx, session.share.workspaceId, id, session.share.projectId), true); });
 }
 async create(req: GuestRequest, key: string, dto: CreateApprovalDto) {
  return serial(this.db, async tx => {
   const { session, email } = await this.identity.confirmed(req, tx);
   const v = await this.version(tx, session.share.workspaceId, dto.versionId, session.share.projectId);
   const hash = createHash('sha256').update(JSON.stringify({ versionId: dto.versionId, confirmed: dto.confirmed })).digest('hex');
   const previous = await tx.approvalRequest.findUnique({ where: { guestSessionId_requestKey: { guestSessionId: session.id, requestKey: key } }, include: { approval: true } });
   if (previous) { if (previous.payloadHash !== hash) throw conflict('Esta tentativa já foi usada para outra aprovação.'); return view(previous.approval); }
   // Only an acknowledged attempt can be replayed after a version is superseded.
   if (v.state !== 'PUBLISHED' || v.project.status !== 'ACTIVE') throw conflict('Esta versão não é mais a atual. Atualize o projeto antes de aprovar.');
   const approval = v.approvals[0];
   const reason = approval ? null : await this.reason(tx, v); if (reason) throw conflict(reason);
   if (await tx.approvalRequest.count({ where: { guestSessionId: session.id } }) >= 100 || await tx.approvalRequest.count({ where: { approval: { versionId: v.id } } }) >= 1000) throw conflict('Limite de tentativas registrado para este acesso ou versão.');
   await tx.project.update({ where: { id: v.projectId }, data: { revision: { increment: 1 } } });
   const result = approval ?? await tx.approval.create({ data: { workspaceId: v.workspaceId, versionId: v.id, guestSessionId: session.id, authorEmail: email } });
   await tx.approvalRequest.create({ data: { guestSessionId: session.id, requestKey: key, payloadHash: hash, approvalId: result.id } });
   return view(result);
  });
 }
}
