import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean, IsUUID } from 'class-validator';
export class CreateApprovalDto {
 @ApiProperty({ format: 'uuid' }) @IsUUID() versionId!: string;
 @ApiProperty({ type: Boolean, enum: [true] }) @IsBoolean() @Equals(true) confirmed!: boolean;
}
export class ApprovalView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty({ format: 'uuid' }) versionId!: string;
 @ApiProperty() authorLabel!: string;
 @ApiProperty({ type: String, format: 'date-time' }) approvedAt!: Date;
}
export class ApprovalStatusView {
 @ApiProperty({ format: 'uuid' }) versionId!: string;
 @ApiProperty({ type: 'integer' }) versionNumber!: number;
 @ApiProperty() versionState!: string;
 @ApiProperty({ type: ApprovalView, nullable: true }) approval!: ApprovalView | null;
 @ApiProperty() canApprove!: boolean;
 @ApiProperty({ type: String, nullable: true }) reason!: string | null;
}
