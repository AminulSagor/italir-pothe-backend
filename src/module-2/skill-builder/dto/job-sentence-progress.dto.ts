import { IsDateString, IsOptional } from 'class-validator';

export class ReviewJobSentenceDto {
  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}
