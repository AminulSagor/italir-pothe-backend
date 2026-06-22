import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class StartAiTutorVoiceSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  topic?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(60)
  @Max(3600)
  ttlSeconds?: number;
}

export class AiTutorChatHistoryMessageDto {
  @IsIn(['user', 'assistant'])
  role: 'user' | 'assistant';

  @IsString()
  @MaxLength(4000)
  content: string;
}

export class SendAiTutorMessageDto {
  @IsString()
  @MaxLength(2000)
  message: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  conversationId?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AiTutorChatHistoryMessageDto)
  history?: AiTutorChatHistoryMessageDto[];
}
