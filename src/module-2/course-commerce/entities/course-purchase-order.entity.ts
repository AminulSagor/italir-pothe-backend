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
import { Course } from '../../courses/entities/course.entity';
import {
  CommerceCurrency,
  CoursePaymentProvider,
  CoursePurchaseStatus,
} from '../types/course-commerce.type';

@Entity('course_purchase_orders')
@Index(['userId', 'idempotencyKey'], {
  unique: true,
})
export class CoursePurchaseOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({
    type: 'varchar',
    length: 40,
  })
  orderNumber: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  courseId: string;

  /**
   * Existing Course.price value at checkout.
   * Course price always uses EUR.
   */
  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  basePriceEur: string;

  /**
   * Existing Course.couponCode copied at checkout.
   */
  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  couponCodeSnapshot: string | null;

  @Column({
    type: 'smallint',
    default: 0,
  })
  discountPercentage: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  discountAmountEur: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  payableAmountEur: string;

  @Column({
    type: 'enum',
    enum: CommerceCurrency,
  })
  paymentCurrency: CommerceCurrency;

  /**
   * Present only for BDT orders.
   */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 6,
    nullable: true,
  })
  forexRateSnapshot: string | null;

  /**
   * Final charged amount in paymentCurrency.
   */
  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  paymentAmount: string;

  @Column({
    type: 'enum',
    enum: CoursePaymentProvider,
  })
  paymentProvider: CoursePaymentProvider;

  @Column({
    type: 'enum',
    enum: CoursePurchaseStatus,
    default: CoursePurchaseStatus.PENDING,
  })
  status: CoursePurchaseStatus;

  @Column({ type: 'uuid' })
  idempotencyKey: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  paidAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  refundedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User | null;

  @ManyToOne(() => Course, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'courseId' })
  course: Course;
}
