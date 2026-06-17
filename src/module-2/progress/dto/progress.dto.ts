import {
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class RecordLessonVideoProgressDto {
  @IsUUID()
  courseId: string;

  @IsUUID()
  lessonId: string;

  @IsInt()
  @Min(0)
  @Max(100)
  watchedPercent: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  timeSpentSeconds?: number;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}

export class MarkTheoryReadDto {
  @IsUUID()
  courseId: string;

  @IsUUID()
  lessonId: string;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}

export class MarkLessonCompletedDto {
  @IsUUID()
  courseId: string;

  @IsUUID()
  lessonId: string;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}

export class RecordAudioTrackListenedDto {
  @IsUUID()
  courseId: string;

  @IsUUID()
  lessonId: string;

  @IsOptional()
  @IsUUID()
  audioFileId?: string;

  @IsOptional()
  @IsDateString()
  clientActivityDate?: string;
}
