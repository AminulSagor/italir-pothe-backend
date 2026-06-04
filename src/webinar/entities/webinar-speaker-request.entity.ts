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

export enum WebinarSpeakerRequestPermission {
  REQUESTED = 'requested',
  GRANTED = 'granted',
  REJECTED = 'rejected',
}

@Entity('webinar_speaker_requests')
@Index(['webinarId', 'userId'], { unique: true })
export class WebinarSpeakerRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  webinarId: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({
    type: 'varchar',
    length: 30,
    default: WebinarSpeakerRequestPermission.REQUESTED,
  })
  speakingPermission: WebinarSpeakerRequestPermission;

  @Column({ type: 'uuid', nullable: true })
  respondedByAdminId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;

  @ManyToOne(() => Webinar, (webinar) => webinar.speakerRequests, {
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
