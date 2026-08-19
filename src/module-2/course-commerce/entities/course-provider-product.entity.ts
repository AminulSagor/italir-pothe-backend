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

import { Course } from '../../courses/entities/course.entity';
import {
  CourseAccessType,
  CoursePaymentProvider,
  CourseProviderProductType,
} from '../types/course-commerce.type';

@Entity('course_provider_products')
@Index(['courseId', 'provider', 'isActive'])
export class CourseProviderProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  courseId: string | null;

  @Column({
    type: 'enum',
    enum: CoursePaymentProvider,
  })
  provider: CoursePaymentProvider;

  @Column({
    type: 'varchar',
    length: 255,
  })
  productId: string;

  @Column({
    type: 'enum',
    enum: CourseProviderProductType,
    default: CourseProviderProductType.NON_CONSUMABLE,
  })
  productType: CourseProviderProductType;

  @Column({
    type: 'varchar',
    length: 30,
    default: CourseAccessType.LIFETIME,
  })
  accessType: CourseAccessType;

  @Column({ type: 'smallint', nullable: true })
  durationDays: number | null;

  /**
   * Used primarily for Google Play subscriptions.
   * Lifetime courses are currently non-consumable, so this normally remains null.
   */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  basePlanId: string | null;

  /**
   * Optional Google Play or App Store offer identifier.
   */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  offerId: string | null;

  @Column({
    type: 'boolean',
    default: true,
  })
  isActive: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @ManyToOne(() => Course, (course) => course.providerProducts, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({
    name: 'courseId',
  })
  course: Course | null;
}
