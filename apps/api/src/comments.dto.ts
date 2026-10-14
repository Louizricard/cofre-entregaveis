import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsDefined, IsObject, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, Min, ValidateNested } from 'class-validator';
export class CommentAnchorDto {
 @ApiProperty({ enum: ['GENERAL', 'TIME', 'IMAGE_POINT', 'PDF_POINT'] }) @IsIn(['GENERAL', 'TIME', 'IMAGE_POINT', 'PDF_POINT']) kind!: string;
 @ApiPropertyOptional({ type: 'integer', minimum: 0 }) @IsOptional() @IsInt() @Min(0) @Max(1800000) timeMs?: number | null;
 @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100 }) @IsOptional() @IsInt() @Min(1) @Max(100) page?: number | null;
 @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1) x?: number | null;
 @ApiPropertyOptional({ type: Number, minimum: 0, maximum: 1 }) @IsOptional() @IsNumber({ allowNaN: false, allowInfinity: false }) @Min(0) @Max(1) y?: number | null;
}
export class CreateCommentDto {
 @ApiProperty({ format: 'uuid' }) @IsUUID() assetId!: string;
 @ApiProperty({ format: 'uuid', description: 'Identificador estável para repetir uma tentativa de envio.' }) @IsUUID() clientRequestId!: string;
 @ApiProperty({ minLength: 1, maxLength: 4000 }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
 @IsString() @Length(1, 4000) @Matches(/^[^\x00-\x08\x0b\x0c\x0e-\x1f\x7f]+$/) body!: string;
 @ApiProperty({ type: CommentAnchorDto }) @Type(() => CommentAnchorDto) @IsDefined() @IsObject() @ValidateNested() anchor!: CommentAnchorDto;
}
export class CommentAnchorView {
 @ApiProperty() kind!: string;
 @ApiProperty({ type: 'integer', nullable: true }) timeMs!: number | null;
 @ApiProperty({ type: 'integer', nullable: true }) page!: number | null;
 @ApiProperty({ type: Number, nullable: true }) x!: number | null;
 @ApiProperty({ type: Number, nullable: true }) y!: number | null;
}
export class CommentView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() body!: string;
 @ApiProperty() authorLabel!: string;
 @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
 @ApiProperty({ type: CommentAnchorView }) anchor!: CommentAnchorView;
}
export class CommentsView {
 @ApiProperty({ type: [CommentView] }) items!: CommentView[];
 @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
 @ApiProperty() canComment!: boolean;
 @ApiProperty({ type: [String] }) anchorTypes!: string[];
 @ApiProperty({ type: 'integer' }) pages!: number;
 @ApiProperty({ type: 'integer' }) durationMs!: number;
}
