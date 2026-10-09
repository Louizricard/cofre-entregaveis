import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ErrorView } from './dto.js';
import { type AuthRequest, MutationGuard, SessionGuard } from './security.js';
import { ClientDto, ClientsView, ClientView, PageQuery, ProjectDto, ProjectQuery, ProjectsView, ProjectView, RevisionDto, UpdateClientDto, UpdateProjectDto } from './work.dto.js';
import { WorkService } from './work.service.js';

@ApiTags('clients') @ApiCookieAuth('session') @UseGuards(SessionGuard)
@ApiResponse({ status: 400, type: ErrorView }) @ApiResponse({ status: 401, type: ErrorView }) @ApiResponse({ status: 403, type: ErrorView }) @ApiResponse({ status: 404, type: ErrorView }) @ApiResponse({ status: 409, type: ErrorView })
@Controller('clients')
export class ClientsController {
 constructor(private readonly work: WorkService) {}
 @Get() @ApiOkResponse({ type: ClientsView })
 list(@Req() req: AuthRequest, @Query() q: PageQuery) { return this.work.clients(req.identity.workspace.id, q); }
 @Post() @UseGuards(MutationGuard) @ApiCreatedResponse({ type: ClientView })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 create(@Req() req: AuthRequest, @Body() dto: ClientDto) { return this.work.createClient(req.identity.workspace.id, dto); }
 @Patch(':id') @UseGuards(MutationGuard) @ApiOkResponse({ type: ClientView })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 update(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClientDto) { return this.work.updateClient(req.identity.workspace.id, id, dto); }
}
@ApiTags('projects') @ApiCookieAuth('session') @UseGuards(SessionGuard)
@ApiResponse({ status: 400, type: ErrorView }) @ApiResponse({ status: 401, type: ErrorView }) @ApiResponse({ status: 403, type: ErrorView }) @ApiResponse({ status: 404, type: ErrorView }) @ApiResponse({ status: 409, type: ErrorView })
@Controller('projects')
export class ProjectsController {
 constructor(private readonly work: WorkService) {}
 @Get() @ApiOkResponse({ type: ProjectsView })
 list(@Req() req: AuthRequest, @Query() q: ProjectQuery) { return this.work.projects(req.identity.workspace.id, q); }
 @Get(':id') @ApiOkResponse({ type: ProjectView })
 get(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string) { return this.work.project(req.identity.workspace.id, id); }
 @Post() @UseGuards(MutationGuard) @ApiCreatedResponse({ type: ProjectView })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 create(@Req() req: AuthRequest, @Body() dto: ProjectDto) { return this.work.createProject(req.identity.workspace.id, dto); }
 @Patch(':id') @UseGuards(MutationGuard) @ApiOkResponse({ type: ProjectView })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 update(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProjectDto) { return this.work.updateProject(req.identity.workspace.id, id, dto); }
 @Post(':id/archive') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: ProjectView })
 @ApiHeader({ name: 'X-CSRF-Token', required: true }) @ApiHeader({ name: 'Origin', required: true })
 archive(@Req() req: AuthRequest, @Param('id', ParseUUIDPipe) id: string, @Body() dto: RevisionDto) { return this.work.updateProject(req.identity.workspace.id, id, dto, true); }
}
