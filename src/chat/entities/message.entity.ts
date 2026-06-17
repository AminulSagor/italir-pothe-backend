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
import { User } from '../../users/entities/user.entity';
import { MessageType } from '../enums/chat.enums';
import { Conversation } from './conversation.entity';

@Entity('messages')
@Index('UQ_messages_conversation_sequenceNo', ['conversationId', 'sequenceNo'], {
  unique: true,
})
@Index('UQ_messages_sender_clientMessageId', ['senderId', 'clientMessageId'], {
  unique: true,
})
@Index('IDX_messages_conversation_createdAt', ['conversationId', 'createdAt'])
@Index('IDX_messages_senderId', ['senderId'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ type: 'uuid', nullable: true })
  senderId: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'senderId' })
  sender: User | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  clientMessageId: string | null;

  @Column({ type: 'int' })
  sequenceNo: number;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({
    type: 'enum',
    enum: MessageType,
    default: MessageType.TEXT,
  })
  messageType: MessageType;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  editedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  deletedAt: Date | null;
}
