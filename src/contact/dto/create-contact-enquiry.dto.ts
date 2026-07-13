import { Transform, type TransformFnParams } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
} from 'class-validator';

const trimValue = ({ value }: TransformFnParams): unknown => {
  return typeof value === 'string' ? value.trim() : value;
};

export class CreateContactEnquiryDto {
  @Transform(trimValue)
  @IsString()
  @Length(2, 80)
  name: string;

  @Transform(({ value }: TransformFnParams): unknown => {
    return typeof value === 'string' ? value.trim().toLowerCase() : value;
  })
  @IsEmail()
  @MaxLength(160)
  email: string;

  @Transform(trimValue)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  subject?: string;

  @Transform(trimValue)
  @IsString()
  @Length(10, 3000)
  message: string;

  /**
   * Hidden honeypot field.
   * Normal visitors leave this empty.
   */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
