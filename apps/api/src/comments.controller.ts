import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { MutationGuard, SessionGuard, type AuthRequest } from './security.js';
import type { GuestRequest } from './sharing.service.js';
import { CommentsService } from './comments.service.js';
import { CommentsView, CommentView, CreateCommentDto } from './comments.dto.js';
import { ListQuery } from './projects.dto.js';
@ApiTags('comments') @UseGuards(ThrottlerGuard) @Controller()
export class CommentsController {
 constructor(private readonly service: CommentsService) {}
 @Get('assets/:id/comments') @UseGuards(SessionGuard) @ApiOkResponse({ type: CommentsView })
 creator(@Req() req: AuthRequest, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: ListQuery) { return this.service.creator(req.identity.workspace.id, id, query); }
 @Get('guest/assets/:id/comments') @ApiOkResponse({ type: CommentsView })
 guest(@Req() req: GuestRequest, @Param('id', new ParseUUIDPipe()) id: string, @Query() query: ListQuery) { return this.service.guest(req, id, query); }
 @Post('guest/comments') @UseGuards(MutationGuard) @Throttle({ default: { limit: 30, ttl: 60000 } }) @ApiCreatedResponse({ type: CommentView })
 create(@Req() req: GuestRequest, @Body() dto: CreateCommentDto) { return this.service.create(req, dto); }
}
