import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res, ServiceUnavailableException, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiNoContentResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { CsrfView, ErrorView, HealthView, IdentityView, LoginDto, ProjectsView, RegisterDto } from './dto.js';
import { DATABASE, SETTINGS, type Settings } from './config.js';
import type { Database } from '@cofre/database';
import { type AuthRequest, cookieOptions, csrfCookie, issueCsrf, issueSession, MutationGuard, SessionGuard, sessionCookie, validToken } from './security.js';
@ApiTags('auth')
@ApiResponse({ status: 400, type: ErrorView })
@ApiResponse({ status: 403, type: ErrorView })
@ApiResponse({ status: 429, type: ErrorView })
@UseGuards(ThrottlerGuard)
@Controller('auth')
export class AuthController {
 constructor(private readonly auth: AuthService, @Inject(SETTINGS) private readonly config: Settings) {}
 @Get('csrf') @ApiOkResponse({ type: CsrfView })
 csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response) { return issueCsrf(req, res, this.config); }
 @Post('register') @UseGuards(MutationGuard) @Throttle({ default: { limit: 10, ttl: 60000 } })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 @ApiCreatedResponse({ type: IdentityView }) @ApiResponse({ status: 409, type: ErrorView })
 async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
  const result = await this.auth.register(dto); issueSession(res, result.token, this.config); return result.identity;
 }
 @Post('login') @HttpCode(200) @UseGuards(MutationGuard) @Throttle({ default: { limit: 10, ttl: 60000 } })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 @ApiOkResponse({ type: IdentityView }) @ApiResponse({ status: 401, type: ErrorView })
 async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
  const result = await this.auth.login(dto); issueSession(res, result.token, this.config); return result.identity;
 }
 @Get('me') @UseGuards(SessionGuard) @ApiCookieAuth('session')
 @ApiOkResponse({ type: IdentityView }) @ApiResponse({ status: 401, type: ErrorView })
 me(@Req() req: AuthRequest) { return req.identity; }
 @Post('logout') @HttpCode(204) @UseGuards(MutationGuard) @ApiCookieAuth('session')
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 @ApiNoContentResponse()
 async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
  const token: unknown = req.cookies?.[sessionCookie(this.config)];
  if (validToken(token)) await this.auth.logout(token);
  res.clearCookie(sessionCookie(this.config), cookieOptions(this.config));
  res.clearCookie(csrfCookie(this.config), cookieOptions(this.config));
 }
}
@ApiTags('projects')
@Controller('projects')
export class ProjectsController {
 @Get() @UseGuards(SessionGuard) @ApiCookieAuth('session')
 @ApiOkResponse({ type: ProjectsView }) @ApiResponse({ status: 401, type: ErrorView })
 list(): ProjectsView { return { items: [], nextCursor: null }; }
}
@ApiTags('operations')
@Controller()
export class HealthController {
 constructor(@Inject(DATABASE) private readonly db: Database) {}
 @Get('health') @ApiOkResponse({ type: HealthView })
 health() { return { status: 'ok' }; }
 @Get('ready') @ApiOkResponse({ type: HealthView }) @ApiResponse({ status: 503, type: ErrorView })
 async ready() {
  try { await this.db.$queryRaw`SELECT 1`; return { status: 'ok' }; }
  catch { throw new ServiceUnavailableException({ code: 'DATABASE_UNAVAILABLE', message: 'Banco indisponível.' }); }
 }
}
