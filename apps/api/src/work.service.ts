import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { type Database, Prisma } from '@cofre/database';
import { DATABASE } from './config.js';
import { ClientDto, PageQuery, ProjectDto, ProjectQuery, RevisionDto, UpdateClientDto, UpdateProjectDto } from './work.dto.js';
const clientSelect = { id: true, name: true, email: true, revision: true } as const;
const projectSelect = { id: true, title: true, client: { select: clientSelect }, currency: true, balanceCents: true, includedRevisionRounds: true, status: true, revision: true } as const;
function page<T extends { id: string }>(rows: T[], limit: number) {
 const more = rows.length > limit;
 const items = rows.slice(0, limit);
 return { items, nextCursor: more ? items.at(-1)!.id : null };
}
const conflict = () => new ConflictException({ code: 'STALE_REVISION', message: 'Este registro mudou ou foi arquivado. Atualize a lista e tente novamente.' });
@Injectable()
export class WorkService {
 constructor(@Inject(DATABASE) private readonly db: Database) {}
 async clients(workspaceId: string, q: PageQuery) {
  return page(await this.db.client.findMany({ where: { workspaceId, ...(q.cursor ? { id: { gt: q.cursor } } : {}), ...(q.search ? { OR: [{ name: { contains: q.search, mode: 'insensitive' } }, { email: { contains: q.search, mode: 'insensitive' } }] } : {}) }, orderBy: { id: 'asc' }, take: q.limit + 1, select: clientSelect }), q.limit);
 }
 async createClient(workspaceId: string, dto: ClientDto) {
  try { return await this.db.client.create({ data: { workspaceId, ...dto }, select: clientSelect }); }
  catch (e) { this.duplicate(e); throw e; }
 }
 async updateClient(workspaceId: string, id: string, dto: UpdateClientDto) {
  try {
   return await this.db.$transaction(async tx => {
    if (!await tx.client.findFirst({ where: { id, workspaceId } })) throw new NotFoundException();
    const { revision, ...data } = dto;
    const result = await tx.client.updateMany({ where: { id, workspaceId, revision }, data: { ...data, revision: { increment: 1 } } });
    if (!result.count) throw conflict();
    return tx.client.findUniqueOrThrow({ where: { id }, select: clientSelect });
   });
  } catch (e) { this.duplicate(e); throw e; }
 }
 private duplicate(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException({ code: 'CLIENT_EMAIL_EXISTS', message: 'Já existe um cliente com este e-mail no workspace.' });
 }
 async projects(workspaceId: string, q: ProjectQuery) {
  return page(await this.db.project.findMany({ where: { workspaceId, status: q.status, ...(q.cursor ? { id: { gt: q.cursor } } : {}), ...(q.search ? { OR: [{ title: { contains: q.search, mode: 'insensitive' } }, { client: { name: { contains: q.search, mode: 'insensitive' } } }] } : {}) }, orderBy: { id: 'asc' }, take: q.limit + 1, select: projectSelect }), q.limit);
 }
 async project(workspaceId: string, id: string) {
  const result = await this.db.project.findFirst({ where: { id, workspaceId }, select: projectSelect });
  if (!result) throw new NotFoundException();
  return result;
 }
 async createProject(workspaceId: string, dto: ProjectDto) {
  if (!await this.db.client.findFirst({ where: { id: dto.clientId, workspaceId } })) throw new NotFoundException();
  return this.db.project.create({ data: { workspaceId, ...dto }, select: projectSelect });
 }
 async updateProject(workspaceId: string, id: string, dto: UpdateProjectDto | RevisionDto, archive = false) {
  return this.db.$transaction(async tx => {
   if (!await tx.project.findFirst({ where: { id, workspaceId } })) throw new NotFoundException();
   const { revision, ...data } = dto;
   if ('clientId' in data && !await tx.client.findFirst({ where: { id: data.clientId, workspaceId } })) throw new NotFoundException();
   const result = await tx.project.updateMany({ where: { id, workspaceId, revision, status: 'ACTIVE' }, data: { ...data, ...(archive ? { status: 'ARCHIVED' as const } : {}), revision: { increment: 1 } } });
   if (!result.count) throw conflict();
   return tx.project.findUniqueOrThrow({ where: { id }, select: projectSelect });
  });
 }
}
