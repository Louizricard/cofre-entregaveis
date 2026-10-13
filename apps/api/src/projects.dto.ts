import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class CreateClientDto {
 @ApiProperty({ minLength: 1, maxLength: 120 })
 @Transform(trim) @IsString() @Length(1, 120) name!: string;
 @ApiProperty({ format: 'email', maxLength: 254 })
 @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value)
 @IsEmail() @MaxLength(254) email!: string;
}
export class CreateProjectDto {
 @ApiProperty({ format: 'uuid' }) @IsUUID() clientId!: string;
 @ApiProperty({ minLength: 1, maxLength: 160 })
 @Transform(trim) @IsString() @Length(1, 160) title!: string;
 @ApiProperty({ type: 'integer', minimum: 0, maximum: 2147483647 })
 @IsInt() @Min(0) @Max(2147483647) balanceCents!: number;
 @ApiProperty({ type: 'integer', minimum: 0, maximum: 1000 })
 @IsInt() @Min(0) @Max(1000) includedRevisionRounds!: number;
}
export class ListQuery {
 @ApiPropertyOptional({ format: 'uuid' }) @IsOptional() @IsUUID() cursor?: string;
 @ApiPropertyOptional({ type: 'integer', minimum: 1, maximum: 100, default: 20 })
 @IsOptional() @Transform(({ value }: { value: unknown }) => typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value)
 @IsInt() @Min(1) @Max(100) limit?: number;
 @ApiPropertyOptional({ maxLength: 120 }) @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
}
export class ProjectsQuery extends ListQuery {
 @ApiPropertyOptional({ enum: ['ACTIVE', 'ARCHIVED'] }) @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status?: 'ACTIVE' | 'ARCHIVED';
}
export class EmptyDto {}
export class ClientView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() name!: string;
 @ApiProperty({ format: 'email' }) email!: string;
 @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class ProjectView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() title!: string;
 @ApiProperty({ enum: ['BRL'] }) currency!: string;
 @ApiProperty({ type: 'integer' }) balanceCents!: number;
 @ApiProperty({ type: 'integer' }) includedRevisionRounds!: number;
 @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
 @ApiProperty({ type: ClientView }) client!: ClientView;
 @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
 @ApiProperty({ type: String, format: 'date-time' }) updatedAt!: Date;
}
export class ClientsView {
 @ApiProperty({ type: [ClientView] }) items!: ClientView[];
 @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
export class ProjectsView {
 @ApiProperty({ type: [ProjectView] }) items!: ProjectView[];
 @ApiProperty({ type: String, nullable: true }) nextCursor!: string | null;
}
