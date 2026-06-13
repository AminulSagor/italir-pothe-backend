import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { DirectConversation } from './direct-conversation.entity';

export enum CallStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  ENDED = 'ended',
  REJECTED = 'rejected',
  MISSED = 'missed',
  FAILED = 'failed',
}

export enum CallType {
  AUDIO = 'audio',
  VIDEO = 'video',
}

@Entity('calls')
@Index(['directConversationId', 'createdAt'])
@Index(['callerId', 'createdAt'])
@Index(['recipientId', 'createdAt'])
@Index(['status'])
export class Call {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  directConversationId: string;

  @ManyToOne(() => DirectConversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'directConversationId' })
  directConversation: DirectConversation;

  @Column({ type: 'uuid' })
  callerId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'callerId' })
  caller: User;

  @Column({ type: 'uuid' })
  recipientId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recipientId' })
  recipient: User;

  @Column({
    type: 'enum',
    enum: CallStatus,
    default: CallStatus.PENDING,
  })
  status: CallStatus;

  @Column({
    type: 'enum',
    enum: CallType,
  })
  callType: CallType;

  @Column({ type: 'varchar', nullable: true })
  agoraChannelName: string;

  @Column({ type: 'integer', nullable: true })
  callerAgoraUid: number;

  @Column({ type: 'integer', nullable: true })
  recipientAgoraUid: number;

  @CreateDateColumn({ type: 'timestamptz' })
  initiatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  answeredAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date;

  @Column({ type: 'integer', default: 0 })
  durationSeconds: number;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
