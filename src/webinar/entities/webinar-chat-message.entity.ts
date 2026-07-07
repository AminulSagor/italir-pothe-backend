import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from 'src/users/entities/user.entity';
import { Webinar } from './webinar.entity';

@Entity('webinar_chat_messages')
export class WebinarChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  webinarId: string;

  @Index()
  @Column({ type: 'uuid' })
  senderUserId: string;

  @Column({ type: 'varchar', length: 1000 })
  message: string;

  @Column({ type: 'boolean', default: false })
  isHost: boolean;

  @ManyToOne(() => Webinar, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'webinarId' })
  webinar: Webinar;

  @ManyToOne(() => User, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'senderUserId',
  })
  sender: User | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
