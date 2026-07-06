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

type TransformInput = {
  value: unknown;
  obj?: Record<string, unknown>;
};

const hasMeaningfulValue = (value: unknown): boolean => {
  if (typeof value === 'string') {
    return value.trim().length > 0;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (value && typeof value === 'object') {
    return Object.keys(value).length > 0;
  }

  return value !== null && value !== undefined;
};

const resolveAlias = (
  value: unknown,
  obj: Record<string, unknown> | undefined,
  aliases: string[],
): unknown => {
  if (hasMeaningfulValue(value)) {
    return value;
  }

  if (!obj) {
    return value;
  }

  for (const alias of aliases) {
    const aliasValue = obj[alias];

    if (hasMeaningfulValue(aliasValue)) {
      return aliasValue;
    }
  }

  return value;
};

const trimString = ({ value }: TransformInput) =>
  typeof value === 'string' ? value.trim() : value;

const trimAliasedString =
  (aliases: string[]) =>
  ({ value, obj }: TransformInput) => {
    const resolvedValue = resolveAlias(value, obj, aliases);

    return typeof resolvedValue === 'string'
      ? resolvedValue.trim()
      : resolvedValue;
  };

const normalizeStringArrayValue = (value: unknown): unknown => {
  if (typeof value === 'string') {
    return value
      .split(/[\n,;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(value)) {
    return value;
  }

  return [
    ...new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
};

const trimStringArray = ({ value }: TransformInput) =>
  normalizeStringArrayValue(value);

const normalizeNestedArray =
  (aliases: string[] = []) =>
  ({ value, obj }: TransformInput) => {
    const resolvedValue = resolveAlias(value, obj, aliases);

    if (
      resolvedValue === null ||
      resolvedValue === undefined ||
      resolvedValue === ''
    ) {
      return undefined;
    }

    return Array.isArray(resolvedValue) ? resolvedValue : [resolvedValue];
  };

const mergeSkillFields = ({
  value,
  obj,
}: TransformInput): string[] | unknown => {
  const values: unknown[] = [
    value,
    obj?.skills,
    obj?.technicalSkills,
    obj?.softSkills,
  ];

  const mergedValues: string[] = [];

  for (const currentValue of values) {
    const normalized = normalizeStringArrayValue(currentValue);

    if (!Array.isArray(normalized)) {
      continue;
    }

    for (const item of normalized) {
      if (typeof item === 'string' && item.trim()) {
        mergedValues.push(item.trim());
      }
    }
  }

  if (mergedValues.length === 0) {
    return value;
  }

  return [...new Set(mergedValues)];
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

  /*
   * Canonical field: professionalTitle
   * Chatbot fallback: targetJob
   */
  @Transform(trimAliasedString(['targetJob']))
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

  /*
   * Canonical field: summary
   * Chatbot fallback: professionalSummary
   */
  @Transform(trimAliasedString(['professionalSummary']))
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

  /*
   * Canonical field: experiences
   * Chatbot fallback: workExperience
   *
   * workExperience must contain an object or array
   * of objects. Plain unstructured text will correctly
   * fail DTO validation.
   */
  @Transform(normalizeNestedArray(['workExperience']))
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @ValidateNested({ each: true })
  @Type(() => CvExperienceDto)
  experiences?: CvExperienceDto[];

  @Transform(normalizeNestedArray())
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @ValidateNested({ each: true })
  @Type(() => CvEducationDto)
  education?: CvEducationDto[];

  /*
   * Combines:
   * skills
   * technicalSkills
   * softSkills
   */
  @Transform(mergeSkillFields)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  skills?: string[];

  @Transform(normalizeNestedArray())
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CvLanguageDto)
  languages?: CvLanguageDto[];

  @Transform(normalizeNestedArray())
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CvCertificationDto)
  certifications?: CvCertificationDto[];

  @Transform(normalizeNestedArray())
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

  @Transform(normalizeNestedArray())
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CvReferenceDto)
  references?: CvReferenceDto[];
}
