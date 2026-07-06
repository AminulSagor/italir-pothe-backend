import { Type } from 'class-transformer';
import {
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class GooglePubSubPushDto {
  @IsObject()
  message: Record<string, unknown>;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  subscription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  deliveryAttempt?: number;
}
