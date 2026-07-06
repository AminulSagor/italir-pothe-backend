import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsUUID,
} from 'class-validator';

import { CvAssistantConversationMode } from '../enums/cv-assistant.enum';

const uniqueStringArray = ({ value }: { value: unknown }): unknown => {
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

export class CreateCvSessionDto {
  @IsOptional()
  @IsUUID()
  templateId?: string;

  @IsOptional()
  @IsEnum(CvAssistantConversationMode)
  conversationMode?: CvAssistantConversationMode;

  @IsOptional()
  @IsUUID()
  profilePhotoFileId?: string;

  @Transform(uniqueStringArray)
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsUUID(undefined, { each: true })
  referenceImageFileIds?: string[];
}
