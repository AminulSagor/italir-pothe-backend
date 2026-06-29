import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';

@Entity('conversation_participants')
@Unique('UQ_conversation_participants_conversation_user', [
  'conversationId',
  'userId',
])
@Index('IDX_conversation_participants_conversationId', ['conversationId'])
@Index('IDX_conversation_participants_userId', ['userId'])
@Index('IDX_conversation_participants_user_archivedAt', [
  'userId',
  'archivedAt',
])
export class ConversationParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User | null;

  @Column({ type: 'uuid', nullable: true })
  lastReadMessageId: string | null;

  @ManyToOne(() => Message, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lastReadMessageId' })
  lastReadMessage: Message | null;

  @Column({ type: 'int', default: 0 })
  lastReadSequenceNo: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastReadAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  lastDeliveredMessageId: string | null;

  @ManyToOne(() => Message, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lastDeliveredMessageId' })
  lastDeliveredMessage: Message | null;

  @Column({ type: 'int', default: 0 })
  lastDeliveredSequenceNo: number;

  @Column({ type: 'timestamptz', nullable: true })
  lastDeliveredAt: Date | null;

  @Column({ type: 'int', default: 0 })
  unreadCount: number;

  @Column({ type: 'boolean', default: false })
  isMuted: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  archivedAt: Date | null;

  @Column({ type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  joinedAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
