import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class CreateCvTemplateDto {
  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @MaxLength(160)
  name: string;

  @Transform(trimString)
  @IsString()
  @IsNotEmpty()
  @IsUrl({
    require_protocol: true,
  })
  @MaxLength(1000)
  imageUrl: string;
}
