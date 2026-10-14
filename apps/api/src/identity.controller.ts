import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { ApiAcceptedResponse, ApiOkResponse, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength } from 'class-validator';
import { MutationGuard } from './security.js';
import type { GuestRequest } from './sharing.service.js';
import { IdentityService } from './identity.service.js';
export class IdentityRequestDto {
 @ApiProperty({ format: 'email', maxLength: 254 }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
 @IsEmail() @MaxLength(254) email!: string;
}
export class IdentityVerifyDto {
 @ApiProperty({ pattern: '^[0-9]{6}$' }) @IsString() @Matches(/^[0-9]{6}$/) code!: string;
}
export class IdentityStatusView {
 @ApiProperty() enabled!: boolean;
 @ApiProperty() verified!: boolean;
}
export class IdentityRequestView { @ApiProperty() message!: string }
@ApiTags('guest-identity') @UseGuards(ThrottlerGuard) @Controller('guest/identity')
export class IdentityController {
 constructor(private readonly service: IdentityService) {}
 @Get() @ApiOkResponse({ type: IdentityStatusView }) status(@Req() req: GuestRequest) { return this.service.status(req); }
 @Post('request') @HttpCode(202) @UseGuards(MutationGuard) @Throttle({ default: { limit: 3, ttl: 60000 } }) @ApiAcceptedResponse({ type: IdentityRequestView })
 request(@Req() req: GuestRequest, @Body() dto: IdentityRequestDto) { return this.service.request(req, dto.email); }
 @Post('verify') @HttpCode(200) @UseGuards(MutationGuard) @Throttle({ default: { limit: 10, ttl: 60000 } }) @ApiOkResponse({ type: IdentityStatusView })
 verify(@Req() req: GuestRequest, @Body() dto: IdentityVerifyDto) { return this.service.verify(req, dto.code); }
}
