import { IsOptional, Matches } from 'class-validator';

export class HomeDashboardQueryDto {
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  weekStart?: string;
}
