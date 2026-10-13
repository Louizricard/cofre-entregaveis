import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ThrottlerGuard } from '@nestjs/throttler';
import { ErrorView } from './dto.js';
import { ClientView, ClientsView, CreateClientDto, CreateProjectDto, EmptyDto, ListQuery, ProjectsQuery, ProjectsView, ProjectView } from './projects.dto.js';
import { ProjectsService } from './projects.service.js';
import { type AuthRequest, MutationGuard, SessionGuard } from './security.js';

@ApiTags('clients') @ApiCookieAuth('session')
@ApiResponse({ status: 400, type: ErrorView }) @ApiResponse({ status: 401, type: ErrorView })
@ApiResponse({ status: 403, type: ErrorView }) @ApiResponse({ status: 429, type: ErrorView })
@UseGuards(SessionGuard, ThrottlerGuard) @Controller('clients')
export class ClientsController {
 constructor(private readonly service: ProjectsService) {}
 @Get() @ApiOkResponse({ type: ClientsView })
 list(@Req() req: AuthRequest, @Query() query: ListQuery) { return this.service.clients(req.identity.workspace.id, query); }
 @Post() @UseGuards(MutationGuard) @ApiCreatedResponse({ type: ClientView }) @ApiResponse({ status: 409, type: ErrorView })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 create(@Req() req: AuthRequest, @Body() dto: CreateClientDto) { return this.service.createClient(req.identity.workspace.id, dto); }
}
@ApiTags('projects') @ApiCookieAuth('session')
@ApiResponse({ status: 400, type: ErrorView }) @ApiResponse({ status: 401, type: ErrorView })
@ApiResponse({ status: 403, type: ErrorView }) @ApiResponse({ status: 404, type: ErrorView }) @ApiResponse({ status: 429, type: ErrorView })
@UseGuards(SessionGuard, ThrottlerGuard) @Controller('projects')
export class ProjectsController {
 constructor(private readonly service: ProjectsService) {}
 @Get() @ApiOkResponse({ type: ProjectsView })
 list(@Req() req: AuthRequest, @Query() query: ProjectsQuery) { return this.service.projects(req.identity.workspace.id, query); }
 @Post() @UseGuards(MutationGuard) @ApiCreatedResponse({ type: ProjectView })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 create(@Req() req: AuthRequest, @Body() dto: CreateProjectDto) { return this.service.createProject(req.identity.workspace.id, dto); }
 @Get(':id') @ApiOkResponse({ type: ProjectView })
 get(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.service.project(req.identity.workspace.id, id); }
 @Post(':id/archive') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: ProjectView })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 archive(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() _dto: EmptyDto) {
  void _dto;
  return this.service.archive(req.identity.workspace.id, id);
 }
}
