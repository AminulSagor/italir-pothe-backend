import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DeleteUserAccountDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  confirmation?: string;
}
