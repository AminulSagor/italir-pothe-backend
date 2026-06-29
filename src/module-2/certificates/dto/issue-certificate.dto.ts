import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export class IssueCertificateDto {
  @IsUUID()
  examAttemptId: string;

  @IsOptional()
  @IsBoolean()
  notifyStudent?: boolean;
}
