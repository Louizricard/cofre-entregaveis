import { BadRequestException, Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { isUUID } from 'class-validator';
import { MutationGuard, SessionGuard, type AuthRequest } from './security.js';
import type { GuestRequest } from './sharing.service.js';
import { ApprovalsService } from './approvals.service.js';
import { ApprovalStatusView, ApprovalView, CreateApprovalDto } from './approvals.dto.js';
@ApiTags('approvals') @UseGuards(ThrottlerGuard) @Controller()
export class ApprovalsController {
 constructor(private readonly service: ApprovalsService) {}
 @Get('versions/:id/approval') @UseGuards(SessionGuard) @ApiOkResponse({ type: ApprovalStatusView })
 creator(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.creator(req.identity.workspace.id, id); }
 @Get('guest/versions/:id/approval') @ApiOkResponse({ type: ApprovalStatusView })
 guest(@Req() req: GuestRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.guest(req, id); }
 @Post('guest/approvals') @UseGuards(MutationGuard) @Throttle({ default: { limit: 10, ttl: 60000 } }) @ApiCreatedResponse({ type: ApprovalView })
 @ApiHeader({ name: 'idempotency-key', required: true, schema: { type: 'string', format: 'uuid' } })
 create(@Req() req: GuestRequest, @Headers('idempotency-key') key: string, @Body() dto: CreateApprovalDto) {
  if (typeof key !== 'string' || !isUUID(key)) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Envie uma chave de tentativa válida.' });
  return this.service.create(req, key, dto);
 }
}
