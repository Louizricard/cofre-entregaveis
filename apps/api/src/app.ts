import 'reflect-metadata';
import { BadRequestException, Module, ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ThrottlerModule } from '@nestjs/throttler';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Response } from 'express';
import { createDatabase, type Database } from '@cofre/database';
import { AuthService } from './auth.service.js';
import { AuthController, HealthController } from './controllers.js';
import { ProjectsController, ClientsController } from './projects.controller.js';
import { ProjectsService } from './projects.service.js';
import { FilesController } from './files.controller.js';
import { FilesService, MAINTENANCE } from './files.service.js';
import { MediaService } from './media.service.js';
import { IdentityController } from './identity.controller.js';
import { IdentityService } from './identity.service.js';
import { MAILER, ResendIdentityMailer, type IdentityMailer } from './identity-mail.js';
import { SharingService } from './sharing.service.js';
import { SharingController, GuestController } from './sharing.controller.js';
import { R2Storage, STORAGE, type ObjectStorage } from './storage.js';
import { DATABASE, SETTINGS, settings, type Settings } from './config.js';
import { ErrorFilter } from './errors.js';
import { type AuthRequest, MutationGuard, SessionGuard } from './security.js';
export function openapi(app: INestApplication) {
 return SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Cofre de Entregáveis').setDescription('Contas, clientes e projetos. Sessão opaca em cookie HttpOnly. Em produção o cookie chama-se __Host-cofre-session. Antes de mutations, GET /auth/csrf com credentials; enviar csrfToken em X-CSRF-Token, JSON e Origin exata.').setVersion('1.0.0').addCookieAuth('cofre-session', { type: 'apiKey', in: 'cookie' }, 'session').build());
}
export async function createApp(config: Settings = settings(), options: { database?: Database; quiet?: boolean; storage?: ObjectStorage | null; mailer?: IdentityMailer | null } = {}) {
 const db = options.database ?? createDatabase(config.databaseUrl);
 @Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }])],
  controllers: [AuthController, ProjectsController, ClientsController, HealthController, FilesController, SharingController, GuestController, IdentityController],
  providers: [{ provide: SETTINGS, useValue: config }, { provide: DATABASE, useValue: db },
   { provide: STORAGE, useValue: options.storage !== undefined ? options.storage : config.storage ? new R2Storage(config.storage) : null },
   { provide: MAILER, useValue: options.mailer !== undefined ? options.mailer : config.email ? new ResendIdentityMailer(config.email.apiKey, config.email.from) : null },
   { provide: MAINTENANCE, useValue: !options.quiet },
   AuthService, ProjectsService, FilesService, MediaService, SharingService, IdentityService, SessionGuard, MutationGuard],
 })
 class AppModule {}
 const app = await NestFactory.create(AppModule, { logger: false });
 app.setGlobalPrefix('api/v1');
 app.use((req: AuthRequest, res: Response, next: NextFunction) => {
  req.requestId = randomUUID();
  res.setHeader('X-Request-Id', req.requestId);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  if (config.production) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  res.on('finish', () => { if (!options.quiet) console.log(JSON.stringify({ requestId: req.requestId, method: req.method, status: res.statusCode })); });
  next();
 });
 app.use(cookieParser());
 if (!config.production) app.enableCors({ origin: config.origin, credentials: true, methods: ['GET', 'POST', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'X-CSRF-Token'] });
 app.useGlobalFilters(new ErrorFilter());
 app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true, validationError: { target: false, value: false },
  exceptionFactory: errors => new BadRequestException({ code: 'VALIDATION_ERROR', message: 'Revise os campos informados.', details: { fields: errors.map(e => e.property) } }),
 }));
 const document = openapi(app);
 app.getHttpAdapter().get('/api/v1/openapi.json', (_req: unknown, res: Response) => res.json(document));
 await app.init();
 const close = async () => { await app.close(); await db.$disconnect(); };
 return { app, db, close, document };
}
