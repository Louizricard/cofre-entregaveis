import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsIn, IsString, IsUUID, Length, Matches } from 'class-validator';
export class RequestRevisionDto {
 @ApiProperty({ format: 'uuid' }) @IsUUID() versionId!: string;
 @ApiProperty({ minLength: 1, maxLength: 4000 }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
 @IsString() @Length(1, 4000) @Matches(/^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+$/) summary!: string;
}
export class DecideRevisionDto {
 @ApiProperty({ enum: ['ACCEPT', 'REJECT'] }) @IsIn(['ACCEPT', 'REJECT']) decision!: string;
 @ApiProperty({ minLength: 1, maxLength: 1000 }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
 @IsString() @Length(1, 1000) @Matches(/^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+$/) reason!: string;
}
export class RevisionRoundView {
 @ApiProperty() id!: string;
 @ApiProperty() versionId!: string;
 @ApiProperty({ type: 'integer' }) versionNumber!: number;
 @ApiProperty() summary!: string;
 @ApiProperty() state!: string;
 @ApiProperty() extra!: boolean;
 @ApiProperty({ type: 'integer' }) commentCount!: number;
 @ApiProperty({ type: String, nullable: true }) decisionReason!: string | null;
 @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
 @ApiProperty({ type: String, format: 'date-time', nullable: true }) decidedAt!: Date | null;
 @ApiProperty({ type: String, format: 'date-time', nullable: true }) resolvedAt!: Date | null;
}
export class RevisionsView {
 @ApiProperty({ type: [RevisionRoundView] }) items!: RevisionRoundView[];
 @ApiProperty({ type: 'integer' }) included!: number;
 @ApiProperty({ type: 'integer' }) used!: number;
 @ApiProperty({ type: String, nullable: true }) currentVersionId!: string | null;
 @ApiProperty() canRequest!: boolean;
}
