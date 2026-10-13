import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsInt, IsString, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
export class StartUploadDto {
 @ApiProperty({ minLength: 1, maxLength: 200 }) @IsString() @Length(1, 200)
 @Matches(/^[^\x00-\x1f\x7f/\\]+$/) fileName!: string;
 @ApiProperty({ maxLength: 100 }) @IsString() @Length(1, 100) declaredMime!: string;
 @ApiProperty({ pattern: '^[1-9][0-9]{0,9}$', description: 'Bytes como string decimal; máximo 2 GiB.' })
 @IsString() @Matches(/^[1-9][0-9]{0,9}$/) sizeBytes!: string;
}
export class SignPartsDto {
 @ApiProperty({ type: 'array', items: { type: 'integer', minimum: 1, maximum: 256 }, minItems: 1, maxItems: 20 })
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @ArrayUnique() @IsInt({ each: true }) @Min(1, { each: true }) @Max(256, { each: true }) partNumbers!: number[];
}
export class PartDto {
 @ApiProperty({ type: 'integer', minimum: 1, maximum: 256 }) @IsInt() @Min(1) @Max(256) partNumber!: number;
 @ApiProperty({ maxLength: 200 }) @IsString() @Length(1, 200) @Matches(/^[^\x00-\x1f\x7f]+$/) etag!: string;
}
export class CompleteUploadDto {
 @ApiProperty({ type: [PartDto], minItems: 1, maxItems: 256 })
 @IsArray() @ArrayMinSize(1) @ArrayMaxSize(256) @ValidateNested({ each: true }) @Type(() => PartDto) parts!: PartDto[];
}
export class AssetView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() fileName!: string;
 @ApiProperty() mime!: string;
 @ApiProperty() sizeBytes!: string;
 @ApiProperty({ enum: ['INITIATING', 'UPLOADING', 'COMPLETING', 'VALIDATING', 'READY', 'ABORTING', 'ABORTED', 'FAILED'] }) status!: string;
 @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
 @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}
export class VersionView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty({ type: 'integer' }) number!: number;
 @ApiProperty({ enum: ['DRAFT'] }) state!: string;
 @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
 @ApiProperty({ type: [AssetView] }) assets!: AssetView[];
}
export class VersionsView {
 @ApiProperty({ type: [VersionView] }) items!: VersionView[];
 @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class UploadView {
 @ApiProperty({ type: AssetView }) asset!: AssetView;
 @ApiProperty({ type: 'integer' }) partSizeBytes!: number;
 @ApiProperty({ type: 'integer' }) partCount!: number;
}
export class SignedPartView {
 @ApiProperty({ type: 'integer' }) partNumber!: number;
 @ApiProperty() url!: string;
}
export class SignedPartsView {
 @ApiProperty({ type: [SignedPartView] }) parts!: SignedPartView[];
 @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}
export class DownloadView {
 @ApiProperty() url!: string;
 @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
}
export class StorageView {
 @ApiProperty() enabled!: boolean;
 @ApiProperty() maxFileBytes!: string;
 @ApiProperty() quotaBytes!: string;
 @ApiProperty() usedBytes!: string;
 @ApiProperty() reservedBytes!: string;
 @ApiProperty({ type: 'integer' }) activeUploads!: number;
 @ApiProperty({ type: 'integer' }) maxActiveUploads!: number;
 @ApiProperty({ type: 'array', items: { type: 'string' } }) mimeTypes!: string[];
}
