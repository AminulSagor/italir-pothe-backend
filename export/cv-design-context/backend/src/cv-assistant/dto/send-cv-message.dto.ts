import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class SendCvMessageDto {
  @Transform(trimString)
  @IsString()
  @MinLength(1)
  @MaxLength(20_000)
  message: string;
}
