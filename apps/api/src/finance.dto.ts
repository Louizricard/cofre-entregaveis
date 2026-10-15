import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { Equals, IsIn, IsInt, IsString, IsUUID, Length, Min } from 'class-validator';

export class ManualSettlementDto {
 @ApiProperty({ format: 'uuid' }) @IsUUID() invoiceId!: string;
 @ApiProperty({ type: 'integer', minimum: 0 }) @IsInt() @Min(0) expectedRevision!: number;
 @ApiProperty({ enum: ['EXTERNAL_PAYMENT', 'WAIVER', 'REVERSAL'] }) @IsIn(['EXTERNAL_PAYMENT', 'WAIVER', 'REVERSAL']) kind!: 'EXTERNAL_PAYMENT' | 'WAIVER' | 'REVERSAL';
 @ApiProperty({ minLength: 5, maxLength: 1000 }) @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value) @IsString() @Length(5, 1000) reason!: string;
 @ApiProperty({ type: Boolean, enum: [true] }) @Equals(true) confirmed!: boolean;
}
export class InvoiceView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty({ type: 'integer' }) number!: number;
 @ApiProperty({ type: 'integer' }) amountCents!: number;
 @ApiProperty({ enum: ['BRL'] }) currency!: string;
 @ApiProperty({ enum: ['OPEN', 'PAID', 'WAIVED', 'REVERSED'] }) state!: string;
 @ApiProperty({ type: 'integer' }) revision!: number;
}
export class SettlementView {
 @ApiProperty({ format: 'uuid' }) id!: string;
 @ApiProperty({ enum: ['EXTERNAL_PAYMENT', 'WAIVER', 'REVERSAL'] }) kind!: string;
 @ApiProperty() reason!: string;
 @ApiProperty() actorName!: string;
 @ApiProperty({ type: 'integer' }) amountCents!: number;
 @ApiProperty({ type: 'integer' }) invoiceRevision!: number;
 @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
}
export class FinanceView {
 @ApiProperty({ type: InvoiceView }) invoice!: InvoiceView;
 @ApiProperty({ type: [SettlementView] }) history!: SettlementView[];
 @ApiProperty() canSettle!: boolean;
 @ApiProperty() canReverse!: boolean;
}
