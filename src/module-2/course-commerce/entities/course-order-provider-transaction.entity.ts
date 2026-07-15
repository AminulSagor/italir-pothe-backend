import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  CoursePaymentProvider,
  CourseProviderEnvironment,
  CourseProviderVerificationStatus,
} from '../types/course-commerce.type';
import { CoursePurchaseOrder } from './course-purchase-order.entity';

@Entity('course_order_provider_transactions')
@Index(['orderId'], {
  unique: true,
})
@Index(['provider', 'tokenHash'], {
  unique: true,
})
@Index(['provider', 'providerTransactionId'], {
  unique: true,
})
export class CourseOrderProviderTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

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
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  obfuscatedAccountId: string | null;

  /**
   * SHA-256 hash of a Google Play purchase token or another
   * provider verification token.
   *
   * The raw token should not be used as a uniqueness key.
   */
  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  tokenHash: string | null;

  /**
   * Google Play order ID or Apple transaction ID.
   */
  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerTransactionId: string | null;

  @Column({
    type: 'enum',
    enum: CourseProviderEnvironment,
    default: CourseProviderEnvironment.DEVELOPMENT,
  })
  environment: CourseProviderEnvironment;

  @Column({
    type: 'enum',
    enum: CourseProviderVerificationStatus,
    default: CourseProviderVerificationStatus.PENDING,
  })
  verificationStatus: CourseProviderVerificationStatus;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  verifiedAt: Date | null;

  /**
   * Stores development verification information now.
   * Later it can store a sanitized Google Play or App Store
   * verification response.
   */
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  verificationPayload: Record<string, unknown> | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => CoursePurchaseOrder, (order) => order.providerTransaction, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: CoursePurchaseOrder;
}
