import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, Res, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiNoContentResponse, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { MutationGuard, SessionGuard, type AuthRequest } from './security.js';
import { SharingService, type GuestRequest } from './sharing.service.js';
import { BootstrapGuestDto, CreatedShareView, CreateShareDto, GuestAccessView, GuestPreviewDto, GuestProjectView, GuestVersionView, GuestVersionsView, SharesView } from './sharing.dto.js';
import { EmptyDto, ListQuery } from './projects.dto.js';
import { PreviewStateView, PreviewView } from './media.dto.js';
import { ErrorView } from './dto.js';

@ApiTags('sharing') @ApiCookieAuth('session') @UseGuards(SessionGuard, ThrottlerGuard)
@ApiResponse({ status: 401, type: ErrorView }) @ApiResponse({ status: 404, type: ErrorView }) @ApiResponse({ status: 409, type: ErrorView })
@Controller()
export class SharingController {
 constructor(private readonly service: SharingService) {}
 @Post('projects/:id/shares') @UseGuards(MutationGuard) @ApiCreatedResponse({ type: CreatedShareView })
 create(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CreateShareDto) { return this.service.create(req.identity.workspace.id, id, dto.expiresAt); }
 @Get('projects/:id/shares') @ApiOkResponse({ type: SharesView })
 list(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: ListQuery) { return this.service.list(req.identity.workspace.id, id, query); }
 @Delete('shares/:id') @HttpCode(204) @UseGuards(MutationGuard) @ApiNoContentResponse()
 revoke(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EmptyDto) { void dto; return this.service.revoke(req.identity.workspace.id, id); }
}
@ApiTags('guest') @UseGuards(ThrottlerGuard)
@ApiResponse({ status: 401, type: ErrorView }) @ApiResponse({ status: 404, type: ErrorView }) @ApiResponse({ status: 409, type: ErrorView })
@Controller('guest')
export class GuestController {
 constructor(private readonly service: SharingService) {}
 @Post('bootstrap') @HttpCode(200) @UseGuards(MutationGuard) @Throttle({ default: { limit: 10, ttl: 60000 } }) @ApiOkResponse({ type: GuestAccessView })
 bootstrap(@Req() req: GuestRequest, @Res({ passthrough: true }) res: Response, @Body() dto: BootstrapGuestDto) { return this.service.bootstrap(dto.token, req, res); }
 @Post('logout') @HttpCode(204) @UseGuards(MutationGuard) @ApiNoContentResponse()
 logout(@Req() req: GuestRequest, @Res({ passthrough: true }) res: Response, @Body() dto: EmptyDto) { void dto; return this.service.logout(req, res); }
 @Get('project') @ApiOkResponse({ type: GuestProjectView }) project(@Req() req: GuestRequest) { return this.service.project(req); }
 @Get('versions') @ApiOkResponse({ type: GuestVersionsView }) versions(@Req() req: GuestRequest, @Query() query: ListQuery) { return this.service.versions(req, query); }
 @Get('versions/:id') @ApiOkResponse({ type: GuestVersionView }) version(@Req() req: GuestRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.version(req, id); }
 @Get('assets/:id/preview-status') @ApiOkResponse({ type: PreviewStateView }) status(@Req() req: GuestRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.status(req, id); }
 @Post('assets/:id/preview') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: PreviewView })
 preview(@Req() req: GuestRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: GuestPreviewDto) { return this.service.preview(req, id, dto.page); }
}
