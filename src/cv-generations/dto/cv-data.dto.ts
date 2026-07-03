import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const trimString = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

const trimStringArray = ({ value }: { value: unknown }) => {
  if (!Array.isArray(value)) {
    return value;
  }

  return value
    .map((item) => (typeof item === 'string' ? item.trim() : item))
    .filter((item) => item !== '');
};

export class CvExperienceDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  jobTitle: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  company: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  startDate?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isCurrent?: boolean;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(1500)
  description?: string;

  @Transform(trimStringArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  achievements?: string[];
}

export class CvEducationDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(180)
  degree: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(180)
  institution: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(180)
  fieldOfStudy?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  location?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  startDate?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  endDate?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  result?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(800)
  description?: string;
}

export class CvLanguageDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(100)
  name: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(100)
  proficiency?: string;
}

export class CvCertificationDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(180)
  name: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(180)
  issuer?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  issueDate?: string;

  @Transform(trimString)
  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  @MaxLength(1000)
  credentialUrl?: string;
}

export class CvProjectDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(180)
  name: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  role?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  startDate?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(50)
  endDate?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  description?: string;

  @Transform(trimStringArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  technologies?: string[];

  @Transform(trimString)
  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  @MaxLength(1000)
  url?: string;
}

export class CvReferenceDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  name: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  jobTitle?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company?: string;

  @Transform(trimString)
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  email?: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class CvDataDto {
  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  fullName: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(160)
  professionalTitle: string;

  @Transform(trimString)
  @IsEmail()
  @MaxLength(255)
  email: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(40)
  phone: string;

  @Transform(trimString)
  @IsString()
  @MaxLength(180)
  location: string;

  @Transform(trimString)
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  summary?: string;

  @Transform(trimString)
  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  @MaxLength(1000)
  linkedinUrl?: string;

  @Transform(trimString)
  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  @MaxLength(1000)
  portfolioUrl?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CvExperienceDto)
  experiences?: CvExperienceDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CvEducationDto)
  education?: CvEducationDto[];

  @Transform(trimStringArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CvLanguageDto)
  languages?: CvLanguageDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CvCertificationDto)
  certifications?: CvCertificationDto[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CvProjectDto)
  projects?: CvProjectDto[];

  @Transform(trimStringArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(15)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  achievements?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CvReferenceDto)
  references?: CvReferenceDto[];
}
