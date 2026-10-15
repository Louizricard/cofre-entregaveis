import { ConflictException, ForbiddenException, Inject, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Database, Prisma } from '@cofre/database';
import { DATABASE } from './config.js';
import { serial } from './transactions.js';
import { IdentityService } from './identity.service.js';
import type { GuestRequest } from './sharing.service.js';
import { cleanScan } from './security-worker.js';
import { STORAGE, type ObjectStorage } from './storage.js';
import type { ManualSettlementDto } from './finance.dto.js';
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
const conflict = (message: string) => new ConflictException({ code: 'FINANCE_CONFLICT', message });
@Injectable()
export class FinanceService {
 constructor(@Inject(DATABASE) private readonly db: Database, private readonly identity: IdentityService, @Inject(STORAGE) private readonly storage: ObjectStorage | null) {}
 private async current(tx: Prisma.TransactionClient, workspaceId: string, projectId: string) {
  const p = await tx.project.findFirst({ where: { id: projectId, workspaceId } }); if (!p) throw missing();
  const i = await tx.invoice.findFirst({ where: { workspaceId, projectId }, orderBy: { number: 'desc' } });
  if (!i) throw conflict('Cobrança ainda não preparada. Atualize o projeto.');
  return { p, i };
 }
 private async view(tx: Prisma.TransactionClient, workspaceId: string, projectId: string, userId: string) {
  const { p, i } = await this.current(tx, workspaceId, projectId);
  const owner = await tx.workspaceMember.count({ where: { workspaceId, userId, role: 'OWNER' } });
  const events = await tx.manualSettlement.findMany({ where: { workspaceId, invoiceId: i.id }, include: { actor: { select: { name: true } } }, orderBy: [{ invoiceRevision: 'desc' }, { id: 'desc' }], take: 200 });
  return { invoice: { id: i.id, number: i.number, amountCents: i.amountCents, currency: i.currency, state: i.state, revision: i.revision },
   history: events.map(e => ({ id: e.id, kind: e.kind, reason: e.reason, actorName: e.actor.name, amountCents: e.amountCents, invoiceRevision: e.invoiceRevision, createdAt: e.createdAt })),
   canSettle: !!owner && p.status === 'ACTIVE' && ['OPEN', 'REVERSED'].includes(i.state),
   canReverse: !!owner && p.status === 'ACTIVE' && ['PAID', 'WAIVED'].includes(i.state) };
 }
 creator(workspaceId: string, projectId: string, userId: string) { return serial(this.db, tx => this.view(tx, workspaceId, projectId, userId)); }
 settle(workspaceId: string, projectId: string, userId: string, key: string, dto: ManualSettlementDto) {
  return serial(this.db, async tx => {
   const { p, i } = await this.current(tx, workspaceId, projectId);
   if (!await tx.workspaceMember.count({ where: { workspaceId, userId, role: 'OWNER' } })) throw new ForbiddenException({ code: 'OWNER_REQUIRED', message: 'Somente o responsável pelo workspace pode registrar a quitação.' });
   if (!await tx.invoice.count({ where: { id: dto.invoiceId, workspaceId, projectId } })) throw missing();
   const hash = createHash('sha256').update(JSON.stringify({ projectId, invoiceId: dto.invoiceId, expectedRevision: dto.expectedRevision, kind: dto.kind, reason: dto.reason, confirmed: dto.confirmed })).digest('hex');
   const previous = await tx.manualSettlement.findUnique({ where: { workspaceId_requestKey: { workspaceId, requestKey: key } } });
   if (previous) {
    if (previous.actorId !== userId || previous.invoiceId !== i.id || previous.payloadHash !== hash) throw conflict('Esta tentativa já foi usada para outro registro.');
    // A replay returns current status; it never reapplies an old paid event after reversal.
    return this.view(tx, workspaceId, projectId, userId);
   }
   if (p.status !== 'ACTIVE' || dto.invoiceId !== i.id || dto.expectedRevision !== i.revision) throw conflict('A cobrança ou o projeto mudou. Atualize antes de confirmar.');
   if (await tx.manualSettlement.count({ where: { invoiceId: i.id } }) >= 200) throw conflict('Limite de registros desta cobrança atingido.');
   const reverse = dto.kind === 'REVERSAL';
   if (reverse ? !['PAID', 'WAIVED'].includes(i.state) : !['OPEN', 'REVERSED'].includes(i.state)) throw conflict('Esta cobrança já foi alterada. Atualize o projeto.');
   if (p.balanceCents !== (reverse ? 0 : i.amountCents)) throw conflict('O saldo não corresponde à cobrança atual. Revise antes de registrar.');
   if (dto.kind === 'EXTERNAL_PAYMENT' && i.amountCents === 0) throw conflict('Não há valor a receber. Registre uma dispensa explícita com motivo.');
   const state = reverse ? 'REVERSED' : dto.kind === 'WAIVER' ? 'WAIVED' : 'PAID';
   await tx.project.update({ where: { id: projectId }, data: { revision: { increment: 1 }, balanceCents: reverse ? i.amountCents : 0 } });
   await tx.invoice.update({ where: { id: i.id }, data: { state, revision: { increment: 1 } } });
   await tx.manualSettlement.create({ data: { workspaceId, invoiceId: i.id, actorId: userId, requestKey: key, payloadHash: hash, kind: dto.kind, reason: dto.reason, amountCents: i.amountCents, invoiceRevision: i.revision + 1 } });
   return this.view(tx, workspaceId, projectId, userId);
  });
 }
 download(req: GuestRequest, assetId: string) {
  return serial(this.db, async tx => {
   const { session, email } = await this.identity.confirmed(req, tx);
   const asset = await tx.asset.findFirst({ where: { id: assetId, workspaceId: session.share.workspaceId, version: { projectId: session.share.projectId, state: { in: ['PUBLISHED', 'SUPERSEDED'] } } }, include: { version: { include: { approvals: true } } } });
   if (!asset) throw missing();
   const { p, i } = await this.current(tx, session.share.workspaceId, session.share.projectId);
   if (p.status !== 'ACTIVE' || asset.version.state !== 'PUBLISHED' || !asset.version.approvals.length) throw conflict('O original exige aprovação da versão publicada atual.');
   if (!['PAID', 'WAIVED'].includes(i.state) || p.balanceCents !== 0) throw conflict('Aguarde o criador registrar o pagamento recebido ou dispensar a cobrança atual.');
   if (asset.status !== 'READY' || !cleanScan(asset)) throw conflict('O original aguarda uma análise de segurança válida.');
   if (!this.storage) throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Armazenamento indisponível. Tente novamente.' });
   if (await tx.originalGrant.count({ where: { guestSessionId: session.id } }) >= 1000) throw conflict('Limite de downloads deste acesso atingido.');
   await tx.project.update({ where: { id: p.id }, data: { revision: { increment: 1 } } });
   let url: string;
   try { url = await this.storage.download(asset.objectKey, asset.fileName); }
   catch { throw new ServiceUnavailableException({ code: 'STORAGE_UNAVAILABLE', message: 'Não foi possível preparar o download. Tente novamente.' }); }
   const expiresAt = new Date(Date.now() + 60000);
   await tx.originalGrant.create({ data: { workspaceId: p.workspaceId, versionId: asset.versionId, assetId: asset.id, invoiceId: i.id, invoiceRevision: i.revision, guestSessionId: session.id, authorEmail: email, expiresAt } });
   return { url, expiresAt };
  });
 }
}
