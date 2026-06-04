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

import { User } from 'src/users/entities/user.entity';
import { Webinar } from './webinar.entity';

export enum WebinarParticipantSpeakingPermission {
  GRANTED = 'granted',
  REJECTED = 'rejected',
}

@Entity('webinar_participants')
@Index(['webinarId', 'userId'], { unique: true })
@Index(['webinarId', 'agoraUid'], { unique: true })
export class WebinarParticipant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  webinarId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'integer', nullable: true })
  agoraUid: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  joinedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  leftAt: Date | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: WebinarParticipantSpeakingPermission.REJECTED,
  })
  speakingPermission: WebinarParticipantSpeakingPermission;

  @ManyToOne(() => Webinar, (webinar) => webinar.participants, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'webinarId' })
  webinar: Webinar;

  @ManyToOne(() => User, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
