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
import { DeliveryJobStatus, DeliveryType } from '../enums/chat.enums';
import { Conversation } from './conversation.entity';
import { Message } from './message.entity';

@Entity('message_delivery_jobs')
@Unique('UQ_message_delivery_jobs_message_receiver_type', [
  'messageId',
  'receiverId',
  'deliveryType',
])
@Index('IDX_message_delivery_jobs_status_nextRetryAt', [
  'status',
  'nextRetryAt',
])
@Index('IDX_message_delivery_jobs_receiver_status', ['receiverId', 'status'])
@Index('IDX_message_delivery_jobs_conversationId', ['conversationId'])
export class MessageDeliveryJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  messageId: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @Column({ type: 'uuid' })
  conversationId: string;

  @ManyToOne(() => Conversation, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'conversationId' })
  conversation: Conversation;

  @Column({ type: 'uuid' })
  receiverId: string;

  @ManyToOne(() => User, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'receiverId' })
  receiver: User | null;

  @Column({
    type: 'enum',
    enum: DeliveryJobStatus,
    default: DeliveryJobStatus.PENDING,
  })
  status: DeliveryJobStatus;

  @Column({
    type: 'enum',
    enum: DeliveryType,
    default: DeliveryType.SOCKET,
  })
  deliveryType: DeliveryType;

  @Column({ type: 'int', default: 0 })
  retryCount: number;

  @Column({ type: 'timestamptz', nullable: true })
  nextRetryAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lockedAt: Date | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  lockedBy: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
