import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CompleteSurvivalItemDto {
  @IsOptional()
  @IsUUID()
  situationId?: string;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}
