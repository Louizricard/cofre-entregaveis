import { ApiProperty } from '@nestjs/swagger';
export class PreviewStateView {
 @ApiProperty({ enum: ['PENDING', 'RUNNING', 'READY', 'FAILED', 'UNSUPPORTED'] }) state!: string;
 @ApiProperty({ type: String, nullable: true }) failureCode!: string | null;
 @ApiProperty({ type: 'integer' }) pages!: number;
}
export class PreviewView {
 @ApiProperty({ enum: ['IMAGE', 'VIDEO', 'AUDIO'] }) kind!: string;
 @ApiProperty({ enum: ['image/jpeg', 'video/mp4', 'audio/mp4'] }) mime!: string;
 @ApiProperty({ type: 'integer', nullable: true }) durationMs!: number | null;
 @ApiProperty() url!: string;
 @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
 @ApiProperty({ type: 'integer' }) page!: number;
 @ApiProperty({ type: 'integer' }) pages!: number;
}
