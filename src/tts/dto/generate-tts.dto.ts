import { IsString, MaxLength, MinLength } from 'class-validator';

export class GenerateTtsDto {
  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  text: string;
}
