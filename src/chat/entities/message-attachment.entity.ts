import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AttachmentType } from '../enums/chat.enums';
import { Message } from './message.entity';

@Entity('message_attachments')
@Index('IDX_message_attachments_messageId', ['messageId'])
export class MessageAttachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  messageId: string;

  @ManyToOne(() => Message, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'messageId' })
  message: Message;

  @Column({
    type: 'enum',
    enum: AttachmentType,
  })
  attachmentType: AttachmentType;

  @Column({ type: 'varchar', length: 500 })
  fileUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  fileName: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  mimeType: string | null;

  @Column({ type: 'bigint', nullable: true })
  fileSizeBytes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
