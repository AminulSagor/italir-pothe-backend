import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Webinar } from './webinar.entity';

@Entity('webinar_audience_courses')
@Index(['webinarId', 'courseId'], { unique: true })
export class WebinarAudienceCourse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  webinarId: string;

  @Column({ type: 'varchar', length: 80 })
  courseId: string;

  @ManyToOne(() => Webinar, (webinar) => webinar.audienceCourses, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'webinarId' })
  webinar: Webinar;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
