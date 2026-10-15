import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type Database } from '@cofre/database';
import { DATABASE } from './config.js';
import { serial } from './transactions.js';
import type { CreateClientDto, CreateProjectDto, ListQuery, ProjectsQuery } from './projects.dto.js';

const clientSelect = { id: true, name: true, email: true, createdAt: true } as const;
const projectSelect = { id: true, title: true, currency: true, balanceCents: true, includedRevisionRounds: true,
 status: true, createdAt: true, updatedAt: true, client: { select: clientSelect } } as const;
const missing = () => new NotFoundException({ code: 'NOT_FOUND', message: 'Registro não encontrado.' });
function page<T extends { id: string }>(rows: T[], limit: number) {
 const items = rows.slice(0, limit);
 return { items, nextCursor: rows.length > limit ? items[items.length - 1].id : null };
}
@Injectable()
export class ProjectsService {
 constructor(@Inject(DATABASE) private readonly db: Database) {}
 async createClient(workspaceId: string, dto: CreateClientDto) {
  try { return await this.db.client.create({ data: { ...dto, workspaceId }, select: clientSelect }); }
  catch (error) {
   if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException({ code: 'CLIENT_EMAIL_EXISTS', message: 'Já existe um cliente com este e-mail.' });
   }
   throw error;
  }
 }
 async clients(workspaceId: string, query: ListQuery) {
  if (query.cursor && !await this.db.client.findFirst({ where: { id: query.cursor, workspaceId }, select: { id: true } })) {
   throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Paginação inválida. Atualize a lista.' });
  }
  const limit = query.limit ?? 20;
  const rows = await this.db.client.findMany({ where: { workspaceId, ...(query.cursor ? { id: { gt: query.cursor } } : {}),
   ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { email: { contains: query.search, mode: 'insensitive' } }] } : {}) },
   orderBy: { id: 'asc' }, take: limit + 1, select: clientSelect });
  return page(rows, limit);
 }
 async createProject(workspaceId: string, dto: CreateProjectDto) {
  if (!await this.db.client.findFirst({ where: { id: dto.clientId, workspaceId }, select: { id: true } })) throw missing();
  return this.db.project.create({ data: { ...dto, workspaceId, invoices: { create: { amountCents: dto.balanceCents } } }, select: projectSelect });
 }
 async projects(workspaceId: string, query: ProjectsQuery) {
  if (query.cursor && !await this.db.project.findFirst({ where: { id: query.cursor, workspaceId }, select: { id: true } })) {
   throw new BadRequestException({ code: 'INVALID_CURSOR', message: 'Paginação inválida. Atualize a lista.' });
  }
  const limit = query.limit ?? 20;
  const rows = await this.db.project.findMany({ where: { workspaceId, status: query.status,
   ...(query.cursor ? { id: { gt: query.cursor } } : {}),
   ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}) },
   orderBy: { id: 'asc' }, take: limit + 1, select: projectSelect });
  return page(rows, limit);
 }
 async project(workspaceId: string, id: string) {
  const row = await this.db.project.findFirst({ where: { id, workspaceId }, select: projectSelect });
  if (!row) throw missing();
  return row;
 }
 async archive(workspaceId: string, id: string) {
  await serial(this.db, async tx => {
   const p = await tx.project.findFirst({ where: { id, workspaceId } });
   if (!p) throw missing();
   if (p.status === 'ARCHIVED') return;
   await tx.project.update({ where: { id }, data: { revision: { increment: 1 } } });
   if (await tx.asset.count({ where: { workspaceId, version: { projectId: id }, status: { in: ['INITIATING', 'UPLOADING', 'COMPLETING', 'VALIDATING', 'ABORTING'] } } })) {
    throw new ConflictException({ code: 'UPLOADS_PENDING', message: 'Conclua ou cancele os envios antes de arquivar o projeto.' });
   }
   await tx.project.update({ where: { id }, data: { status: 'ARCHIVED' } });
  });
  return this.project(workspaceId, id);
 }
}
