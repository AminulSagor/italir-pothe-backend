import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

const trimString = ({ value }: { value: unknown }) => {
  return typeof value === 'string' ? value.trim() : value;
};

export class RegenerateCvGenerationDto {
  @Transform(trimString)
  @IsString()
  @MinLength(3, {
    message: 'Design instruction must contain at least 3 characters.',
  })
  @MaxLength(1000, {
    message: 'Design instruction cannot exceed 1000 characters.',
  })
  designInstruction: string;
}
