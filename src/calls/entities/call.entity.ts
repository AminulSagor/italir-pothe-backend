import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { Conversation } from '../../chat/entities/conversation.entity';
import { User } from '../../users/entities/user.entity';
import { CallStatus, CallType } from '../enums/call.enums';

@Entity('calls')
@Index('IDX_calls_caller_status', ['callerId', 'status'])
@Index('IDX_calls_receiver_status', ['receiverId', 'status'])
@Index('UQ_calls_agora_channel', ['agoraChannelName'], {
  unique: true,
})
@Index('UQ_calls_caller_client_call_id', ['callerId', 'clientCallId'], {
  unique: true,
  where: '"clientCallId" IS NOT NULL',
})
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * References conversations.id.
   */
  @Column({ type: 'uuid' })
  directConversationId: string;

  @ManyToOne(() => Conversation, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'directConversationId' })
  directConversation: Conversation;

  @Column({ type: 'uuid' })
  callerId: string;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'callerId' })
  caller: User | null;

  @Column({ type: 'uuid' })
  receiverId: string;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'receiverId' })
  receiver: User | null;

  @Column({
    type: 'enum',
    enum: CallType,
  })
  callType: CallType;

  @Column({
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.RINGING,
  })
  status: CallStatus;

  @Column({
    type: 'varchar',
    length: 64,
  })
  agoraChannelName: string;

  @Column({ type: 'int' })
  callerAgoraUid: number;

  @Column({ type: 'int' })
  receiverAgoraUid: number;

  @Column({
    type: 'varchar',
    length: 120,
    nullable: true,
  })
  clientCallId: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
