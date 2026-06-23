import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { CallType } from '../enums/call.enums';

export class InitiateCallDto {
  /**
   * This is the main conversations.id returned by
   * the existing chat APIs.
   */
  @IsUUID('4')
  directConversationId: string;

  @IsEnum(CallType)
  callType: CallType;

  /**
   * Generate this once in Flutter for every call attempt.
   * Reusing the same value prevents duplicate call creation.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  clientCallId?: string;
}
