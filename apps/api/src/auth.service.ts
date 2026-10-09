import { ConflictException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { DATABASE, SETTINGS, type Settings } from './config.js';
import { type Database, Prisma } from '@cofre/database';
import { digest, newToken } from './security.js';
import type { LoginDto, RegisterDto } from './dto.js';
export const passwordOptions = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;
@Injectable()
export class AuthService {
 private readonly dummyHash = argon2.hash(newToken(), passwordOptions);
 constructor(@Inject(DATABASE) private readonly db: Database, @Inject(SETTINGS) private readonly config: Settings) {}
 private sessionData(userId: string, workspaceId: string, token: string) {
  return { userId, workspaceId, tokenHash: digest(token), expiresAt: new Date(Date.now() + this.config.sessionDays * 86400000) };
 }
 async register(dto: RegisterDto) {
  const passwordHash = await argon2.hash(dto.password, passwordOptions);
  const token = newToken();
  try {
   const identity = await this.db.$transaction(async tx => {
    const user = await tx.user.create({ data: { email: dto.email, name: dto.name, passwordHash }, select: { id: true, name: true, email: true } });
    const workspace = await tx.workspace.create({ data: { name: dto.workspaceName }, select: { id: true, name: true } });
    await tx.workspaceMember.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' } });
    await tx.session.create({ data: this.sessionData(user.id, workspace.id, token) });
    return { user, workspace };
   });
   return { identity, token };
  } catch (error) {
   if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new ConflictException({ code: 'EMAIL_EXISTS', message: 'Este e-mail já está cadastrado.' });
   }
   throw error;
  }
 }
 async login(dto: LoginDto) {
  const user = await this.db.user.findUnique({ where: { email: dto.email } });
  const matches = await argon2.verify(user?.passwordHash ?? await this.dummyHash, dto.password);
  if (!user || !matches) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' });
  const token = newToken();
  const identity = await this.db.$transaction(async tx => {
   const membership = await tx.workspaceMember.findFirst({ where: { userId: user.id }, orderBy: [{ createdAt: 'asc' }, { workspaceId: 'asc' }], include: { workspace: { select: { id: true, name: true } } } });
   if (!membership) throw new UnauthorizedException({ code: 'INVALID_CREDENTIALS', message: 'E-mail ou senha inválidos.' });
   await tx.session.create({ data: this.sessionData(user.id, membership.workspaceId, token) });
   return { user: { id: user.id, email: user.email, name: user.name }, workspace: membership.workspace };
  });
  return { identity, token };
 }
 async logout(token: string) {
  await this.db.session.updateMany({ where: { tokenHash: digest(token), revokedAt: null }, data: { revokedAt: new Date() } });
 }
}
