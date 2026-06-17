import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class IssueCertificateDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  courseId: string;

  @IsUUID()
  examAttemptId: string;

  @IsOptional()
  @IsUUID()
  pdfFileId?: string | null;

  @IsOptional()
  @IsBoolean()
  notifyStudent?: boolean;
}
