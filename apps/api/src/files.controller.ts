import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCookieAuth, ApiCreatedResponse, ApiHeader, ApiOkResponse, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ErrorView } from './dto.js';
import { AssetView, CompleteUploadDto, DownloadView, SignPartsDto, SignedPartsView, StartUploadDto, StorageView, UploadView, VersionsView, VersionView } from './files.dto.js';
import { EmptyDto, ListQuery } from './projects.dto.js';
import { FilesService } from './files.service.js';
import { type AuthRequest, MutationGuard, SessionGuard } from './security.js';
import { MediaService } from './media.service.js';
import { ManualPreviewDto, PreviewStateView, PreviewView } from './media.dto.js';
import { IsInt, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
class PreviewPageDto {
 @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 }) @IsInt() @Min(1) @Max(100) page!: number;
}

@ApiTags('files') @ApiCookieAuth('session')
@ApiResponse({ status: 400, type: ErrorView }) @ApiResponse({ status: 401, type: ErrorView })
@ApiResponse({ status: 403, type: ErrorView }) @ApiResponse({ status: 404, type: ErrorView })
@ApiResponse({ status: 409, type: ErrorView }) @ApiResponse({ status: 429, type: ErrorView }) @ApiResponse({ status: 503, type: ErrorView })
@ApiHeader({ name: 'X-CSRF-Token', description: 'Obrigatório em mutations.' })
@ApiHeader({ name: 'Origin', description: 'Origem exata em mutations.' })
@UseGuards(SessionGuard, ThrottlerGuard)
@Throttle({ default: { limit: 120, ttl: 60000 } })
@Controller()
export class FilesController {
 constructor(private readonly files: FilesService, private readonly media: MediaService) {}
 @Post('assets/:id/scan-retry') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: PreviewStateView })
 scanRetry(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EmptyDto) { void dto; return this.media.retryScan(req.identity.workspace.id, id); }
 @Post('assets/:id/manual-preview') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: PreviewStateView })
 manualPreview(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: ManualPreviewDto) { return this.media.manual(req.identity.workspace.id, id, dto.previewAssetId); }
 @Delete('assets/:id/manual-preview') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: PreviewStateView })
 removeManualPreview(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EmptyDto) { void dto; return this.media.manual(req.identity.workspace.id, id, null); }
 @Get('assets/:id/preview-status') @ApiOkResponse({ type: PreviewStateView })
 previewStatus(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.media.state(req.identity.workspace.id, id); }
 @Post('assets/:id/preview') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: PreviewView })
 preview(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: PreviewPageDto) { return this.media.preview(req.identity.workspace.id, id, dto.page); }
 @Post('assets/:id/preview-retry') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: PreviewStateView })
 previewRetry(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EmptyDto) { void dto; return this.media.retry(req.identity.workspace.id, id); }
 @Get('storage') @ApiOkResponse({ type: StorageView })
 storage(@Req() req: AuthRequest) { return this.files.capabilities(req.identity.workspace.id); }
 @Get('projects/:id/versions') @ApiOkResponse({ type: VersionsView })
 versions(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: ListQuery) { return this.files.versions(req.identity.workspace.id, id, query); }
 @Post('projects/:id/versions') @UseGuards(MutationGuard) @ApiCreatedResponse({ type: VersionView })
 createVersion(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EmptyDto) { void dto; return this.files.createVersion(req.identity.workspace.id, id); }
 @Post('versions/:id/uploads') @UseGuards(MutationGuard) @ApiCreatedResponse({ type: UploadView })
 start(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: StartUploadDto) { return this.files.start(req.identity.workspace.id, id, dto); }
 @Get('uploads/:id') @ApiOkResponse({ type: AssetView })
 getUpload(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string) { return this.files.asset(req.identity.workspace.id, id); }
 @Post('uploads/:id/parts') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: SignedPartsView })
 parts(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: SignPartsDto) { return this.files.signParts(req.identity.workspace.id, id, dto.partNumbers); }
 @Post('uploads/:id/complete') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: AssetView })
 complete(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: CompleteUploadDto) { return this.files.complete(req.identity.workspace.id, id, dto); }
 @Delete('uploads/:id') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: AssetView })
 abort(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EmptyDto) { void dto; return this.files.abort(req.identity.workspace.id, id); }
 @Post('assets/:id/download') @HttpCode(200) @UseGuards(MutationGuard) @ApiOkResponse({ type: DownloadView })
 download(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Body() dto: EmptyDto) { void dto; return this.files.download(req.identity.workspace.id, id); }
}
