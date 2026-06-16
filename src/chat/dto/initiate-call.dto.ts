import { IsEnum, IsUUID } from 'class-validator';
import { CallType } from '../entities/call.entity';

export class InitiateCallDto {
  @IsUUID()
  directConversationId: string;

  @IsUUID()
  recipientId: string;

  @IsEnum(CallType)
  callType: CallType;
}
