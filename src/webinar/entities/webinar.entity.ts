import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { WebinarAudienceCourse } from './webinar-audience-course.entity';
import { WebinarParticipant } from './webinar-participant.entity';
import { WebinarSpeakerRequest } from './webinar-speaker-request.entity';

export enum WebinarStatus {
  DRAFT = 'draft',
  SCHEDULED = 'scheduled',
  LIVE = 'live',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('webinars')
export class Webinar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 180 })
  title: string;

  @Index()
  @Column({ type: 'timestamptz' })
  scheduledAt: Date;

  @Column({ type: 'varchar', length: 120 })
  hostTeacherName: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  thumbnailImageUrl: string | null;

  @Column({ type: 'boolean', default: false })
  sendNotification: boolean;

  @Index()
  @Column({ type: 'varchar', length: 30, default: WebinarStatus.DRAFT })
  status: WebinarStatus;

  @Index()
  @Column({ type: 'uuid' })
  createdByAdminId: string;

  @Column({ type: 'uuid', nullable: true })
  updatedByAdminId: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  agoraChannelName: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  liveStartedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  liveEndedAt: Date | null;

  @OneToMany(
    () => WebinarAudienceCourse,
    (audienceCourse) => audienceCourse.webinar,
  )
  audienceCourses: WebinarAudienceCourse[];

  @OneToMany(() => WebinarParticipant, (participant) => participant.webinar)
  participants: WebinarParticipant[];

  @OneToMany(
    () => WebinarSpeakerRequest,
    (speakerRequest) => speakerRequest.webinar,
  )
  speakerRequests: WebinarSpeakerRequest[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
