import { IsDateString, IsOptional } from 'class-validator';

export class ReviewImportantVerbDto {
  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}
