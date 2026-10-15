import { BadRequestException, Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { isUUID } from 'class-validator';
import { SessionGuard, MutationGuard, type AuthRequest } from './security.js';
import type { GuestRequest } from './sharing.service.js';
import { FinanceService } from './finance.service.js';
import { FinanceView, ManualSettlementDto } from './finance.dto.js';
import { DownloadView } from './files.dto.js';
import { EmptyDto } from './projects.dto.js';
@ApiTags('finance') @UseGuards(ThrottlerGuard) @Controller()
export class FinanceController {
 constructor(private readonly service: FinanceService) {}
 @Get('projects/:id/finance') @UseGuards(SessionGuard) @ApiOkResponse({ type: FinanceView })
 get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.creator(req.identity.workspace.id, id, req.identity.user.id); }
 @Post('projects/:id/manual-settlement') @HttpCode(200) @UseGuards(SessionGuard, MutationGuard) @ApiOkResponse({ type: FinanceView })
 @ApiHeader({ name: 'idempotency-key', required: true, schema: { type: 'string', format: 'uuid' } })
 settle(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Headers('idempotency-key') key: string, @Body() dto: ManualSettlementDto) {
  if (typeof key !== 'string' || !isUUID(key)) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Envie uma chave de tentativa válida.' });
  return this.service.settle(req.identity.workspace.id, id, req.identity.user.id, key, dto);
 }
 @Post('guest/assets/:id/download') @HttpCode(200) @UseGuards(MutationGuard) @Throttle({ default: { limit: 10, ttl: 60000 } }) @ApiOkResponse({ type: DownloadView })
 download(@Req() req: GuestRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() _dto: EmptyDto) { void _dto; return this.service.download(req, id); }
}
