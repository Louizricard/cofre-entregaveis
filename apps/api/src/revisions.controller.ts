import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { MutationGuard, SessionGuard, type AuthRequest } from './security.js';
import type { GuestRequest } from './sharing.service.js';
import { RevisionsService } from './revisions.service.js';
import { DecideRevisionDto, RequestRevisionDto, RevisionRoundView, RevisionsView } from './revisions.dto.js';
@ApiTags('revisions') @UseGuards(ThrottlerGuard) @Controller()
export class RevisionsController {
 constructor(private readonly service: RevisionsService) {}
 @Get('projects/:id/revisions') @UseGuards(SessionGuard) @ApiOkResponse({ type: RevisionsView })
 creator(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.creator(req.identity.workspace.id, id); }
 @Get('guest/revisions') @ApiOkResponse({ type: RevisionsView })
 guest(@Req() req: GuestRequest) { return this.service.guest(req); }
 @Post('guest/revision-requests') @UseGuards(MutationGuard) @Throttle({ default: { limit: 10, ttl: 60000 } }) @ApiCreatedResponse({ type: RevisionRoundView })
 @ApiHeader({ name: 'idempotency-key', required: true, schema: { type: 'string', format: 'uuid' } })
 request(@Req() req: GuestRequest, @Headers('idempotency-key') key: string, @Body() dto: RequestRevisionDto) {
  if (typeof key !== 'string' || !isUUID(key)) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Envie uma chave de tentativa válida.' });
  return this.service.request(req, key, dto);
 }
 @Post('revisions/:id/decision') @UseGuards(SessionGuard, MutationGuard) @ApiCreatedResponse({ type: RevisionRoundView })
 decide(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: DecideRevisionDto) { return this.service.decide(req.identity.workspace.id, req.identity.user.id, id, dto); }
}
