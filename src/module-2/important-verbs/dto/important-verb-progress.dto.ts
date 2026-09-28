import { IsDateString, IsIn, IsOptional } from 'class-validator';

export class ReviewImportantVerbDto {
  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;

  @IsOptional()
  @IsIn(['learning'])
  interaction?: 'learning';
}
