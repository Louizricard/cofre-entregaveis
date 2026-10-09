import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
const normalizeEmail = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().toLowerCase() : value;
export class LoginDto {
 @ApiProperty({ format: 'email', maxLength: 254 })
 @Transform(normalizeEmail) @IsEmail() @MaxLength(254) email!: string;
 @ApiProperty({ minLength: 12, maxLength: 128, format: 'password', writeOnly: true })
 @IsString() @Length(12, 128) password!: string;
}
export class RegisterDto extends LoginDto {
 @ApiProperty({ minLength: 1, maxLength: 120 })
 @Transform(trim) @IsString() @Length(1, 120) name!: string;
 @ApiProperty({ minLength: 1, maxLength: 120 })
 @Transform(trim) @IsString() @Length(1, 120) workspaceName!: string;
}
export class UserView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() name!: string;
 @ApiProperty({ format: 'email' }) email!: string;
}
export class WorkspaceView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty() name!: string;
}
export class IdentityView {
 @ApiProperty({ type: UserView }) user!: UserView;
 @ApiProperty({ type: WorkspaceView }) workspace!: WorkspaceView;
}
export class CsrfView { @ApiProperty() csrfToken!: string; }
export class ProjectsView {
 @ApiProperty({ type: 'array', items: { type: 'object' }, maxItems: 0 }) items!: never[];
 @ApiProperty({ type: 'string', nullable: true, enum: [null] }) nextCursor!: null;
}
export class ErrorBody {
 @ApiProperty() code!: string;
 @ApiProperty() message!: string;
 @ApiProperty({ required: false, type: Object, additionalProperties: true }) details?: Record<string, unknown>;
}
export class ErrorView {
 @ApiProperty({ type: ErrorBody }) error!: ErrorBody;
 @ApiProperty({ format: 'uuid' }) requestId!: string;
}
export class HealthView { @ApiProperty({ enum: ['ok'] }) status!: string; }
