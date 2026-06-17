import { IsDateString, IsOptional, IsUUID } from 'class-validator';

export class CompleteSurvivalSituationDto {
  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}

export class CompleteSurvivalItemDto {
  @IsOptional()
  @IsUUID()
  situationId?: string;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}
