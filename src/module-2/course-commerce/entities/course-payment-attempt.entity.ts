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

import {
  CommerceCurrency,
  CoursePaymentAttemptStatus,
  CoursePaymentProvider,
} from '../types/course-commerce.type';
import { CoursePurchaseOrder } from './course-purchase-order.entity';

@Entity('course_payment_attempts')
@Index(['paymentProvider', 'providerReference'], {
  unique: true,
})
export class CoursePaymentAttempt {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  orderId: string;

  @Column({
    type: 'enum',
    enum: CoursePaymentProvider,
  })
  paymentProvider: CoursePaymentProvider;

  @Column({
    type: 'enum',
    enum: CoursePaymentAttemptStatus,
  })
  status: CoursePaymentAttemptStatus;

  @Column({
    type: 'varchar',
    length: 1000,
  })
  providerReference: string;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 2,
  })
  amount: string;

  @Column({
    type: 'enum',
    enum: CommerceCurrency,
  })
  currency: CommerceCurrency;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  failureCode: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  failureMessage: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  completedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @ManyToOne(() => CoursePurchaseOrder, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'orderId' })
  order: CoursePurchaseOrder;
}
