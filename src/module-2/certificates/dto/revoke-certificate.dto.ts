import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RevokeCertificateDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
