import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { RewardedPlacement } from '../types/rewarded-ad.type';

export class CreateRewardedSessionDto {
  @IsEnum(RewardedPlacement)
  placement: RewardedPlacement;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  contextId?: string;
}
