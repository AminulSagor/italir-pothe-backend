import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

const AI_TUTOR_LEVELS = [
  "A1",
  "A1+",
  "A2",
  "A2+",
  "B1",
  "B1+",
  "B2",
  "B2+",
  "C1",
  "C2",
] as const;
const AI_TUTOR_GUIDED_MODES = ["guided", "assisted", "free"] as const;
const AI_TUTOR_GUIDED_LEVELS = ["A1", "A2", "B1"] as const;
const AI_TUTOR_CHAT_MODES = ["general", "writing_help"] as const;
const AI_TUTOR_WRITING_SOURCE_LANGUAGES = ["english", "bangla"] as const;

export class AiTutorLearnerProfileDto {
  @IsIn(AI_TUTOR_LEVELS)
  speakingLevel: string;

  @IsIn(AI_TUTOR_LEVELS)
  vocabularyLevel: string;

  @IsIn(AI_TUTOR_LEVELS)
  grammarLevel: string;

  @IsIn(AI_TUTOR_LEVELS)
  finalLevel: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  summary?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  strengths?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  focusAreas?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(60)
  completedAt?: string;
}

export class StartAiTutorVoiceSessionDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  topic?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3600)
  ttlSeconds?: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => AiTutorLearnerProfileDto)
  learnerProfile?: AiTutorLearnerProfileDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  memoryFacts?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  recentMistakeTags?: string[];

  @IsOptional()
  @IsIn(AI_TUTOR_GUIDED_MODES)
  guidedMode?: "guided" | "assisted" | "free";

  @IsOptional()
  @IsIn(AI_TUTOR_GUIDED_LEVELS)
  guidedLevel?: "A1" | "A2" | "B1";
}

export class AiTutorChatHistoryMessageDto {
  @IsIn(["user", "assistant"])
  role: "user" | "assistant";

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

  @IsOptional()
  @ValidateNested()
  @Type(() => AiTutorLearnerProfileDto)
  learnerProfile?: AiTutorLearnerProfileDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  memoryFacts?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  recentMistakeTags?: string[];

  @IsOptional()
  @IsIn(AI_TUTOR_CHAT_MODES)
  chatMode?: "general" | "writing_help";

  @IsOptional()
  @IsIn(AI_TUTOR_WRITING_SOURCE_LANGUAGES)
  sourceLanguage?: "english" | "bangla";
}

export class TranscribeAiTutorLevelTestDto {
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  question: string;
}

export class AiTutorLevelTestAnswerDto {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  questionId: string;

  @IsIn(["speaking", "vocabulary", "grammar"])
  skill: "speaking" | "vocabulary" | "grammar";

  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  question: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  answer: string;
}

export class EvaluateAiTutorLevelTestDto {
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => AiTutorLevelTestAnswerDto)
  answers: AiTutorLevelTestAnswerDto[];
}
