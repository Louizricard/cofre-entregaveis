import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601, IsInt, IsString, Matches, Max, Min } from 'class-validator';
export class CreateShareDto {
 @ApiProperty({ format: 'date-time' }) @IsISO8601({ strict: true }) expiresAt!: string;
}
export class BootstrapGuestDto {
 @ApiProperty({ minLength: 43, maxLength: 43 }) @IsString() @Matches(/^[A-Za-z0-9_-]{43}$/) token!: string;
}
export class ShareView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty({ format: 'date-time', type: String }) expiresAt!: Date;
 @ApiProperty({ format: 'date-time', type: String, nullable: true }) revokedAt!: Date | null;
 @ApiProperty({ format: 'date-time', type: String }) createdAt!: Date;
}
export class CreatedShareView extends ShareView {
 @ApiProperty({ description: 'Link secreto exibido somente na criação.' }) url!: string;
}
export class SharesView {
 @ApiProperty({ type: [ShareView] }) items!: ShareView[];
 @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class GuestAccessView {
 @ApiProperty({ format: 'date-time', type: String }) expiresAt!: Date;
}
export class GuestVersionSummary {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty({ type: 'integer' }) number!: number;
 @ApiProperty({ enum: ['PUBLISHED', 'SUPERSEDED'] }) state!: string;
}
export class GuestVersionsView {
 @ApiProperty({ type: [GuestVersionSummary] }) items!: GuestVersionSummary[];
 @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class GuestProjectView {
 @ApiProperty() title!: string;
 @ApiProperty({ enum: ['BRL'] }) currency!: string;
 @ApiProperty({ type: 'integer' }) balanceCents!: number;
 @ApiProperty({ type: GuestVersionSummary }) currentVersion!: GuestVersionSummary;
}
export class GuestAssetView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() fileName!: string;
 @ApiProperty() mime!: string;
 @ApiProperty() sizeBytes!: string;
}
export class GuestVersionView extends GuestVersionSummary {
 @ApiProperty({ type: [GuestAssetView] }) assets!: GuestAssetView[];
}
export class GuestPreviewDto {
 @ApiProperty({ type: 'integer', minimum: 1, maximum: 100 }) @IsInt() @Min(1) @Max(100) page!: number;
}
