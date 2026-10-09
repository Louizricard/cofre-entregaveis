import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Max, MaxLength, Min } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export class PageQuery {
 @ApiProperty({ required: false, format: 'uuid' }) @IsOptional() @IsUUID() cursor?: string;
 @ApiProperty({ required: false, type: 'integer', minimum: 1, maximum: 50, default: 20 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit: number = 20;
 @ApiProperty({ required: false, maxLength: 120 }) @IsOptional() @Transform(trim) @IsString() @MaxLength(120) search?: string;
}
export class ProjectQuery extends PageQuery {
 @ApiProperty({ required: false, enum: ['ACTIVE', 'ARCHIVED'], default: 'ACTIVE' }) @IsOptional() @IsIn(['ACTIVE', 'ARCHIVED']) status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE';
}
export class ClientDto {
 @ApiProperty({ minLength: 1, maxLength: 120 }) @Transform(trim) @IsString() @Length(1, 120) name!: string;
 @ApiProperty({ format: 'email', maxLength: 254 }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value) @IsEmail() @MaxLength(254) email!: string;
}
export class RevisionDto {
 @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483646 }) @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class UpdateClientDto extends ClientDto {
 @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483646 }) @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class ProjectDto {
 @ApiProperty({ format: 'uuid' }) @IsUUID() clientId!: string;
 @ApiProperty({ minLength: 1, maxLength: 120 }) @Transform(trim) @IsString() @Length(1, 120) title!: string;
 @ApiProperty({ type: 'integer', minimum: 0, maximum: 2147483647 }) @IsInt() @Min(0) @Max(2147483647) balanceCents!: number;
 @ApiProperty({ type: 'integer', minimum: 0, maximum: 1000 }) @IsInt() @Min(0) @Max(1000) includedRevisionRounds!: number;
}
export class UpdateProjectDto extends ProjectDto {
 @ApiProperty({ type: 'integer', minimum: 1, maximum: 2147483646 }) @IsInt() @Min(1) @Max(2147483646) revision!: number;
}
export class ClientView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() name!: string;
 @ApiProperty({ format: 'email' }) email!: string;
 @ApiProperty({ type: 'integer' }) revision!: number;
}
export class ProjectView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() title!: string;
 @ApiProperty({ type: ClientView }) client!: ClientView;
 @ApiProperty({ enum: ['BRL'] }) currency!: string;
 @ApiProperty({ type: 'integer' }) balanceCents!: number;
 @ApiProperty({ type: 'integer' }) includedRevisionRounds!: number;
 @ApiProperty({ enum: ['ACTIVE', 'ARCHIVED'] }) status!: string;
 @ApiProperty({ type: 'integer' }) revision!: number;
}
export class ClientsView {
 @ApiProperty({ type: [ClientView] }) items!: ClientView[];
 @ApiProperty({ type: 'string', nullable: true }) nextCursor!: string | null;
}
export class ProjectsView {
 @ApiProperty({ type: [ProjectView] }) items!: ProjectView[];
 @ApiProperty({ type: 'string', nullable: true }) nextCursor!: string | null;
}
