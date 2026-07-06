import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  BillingOrderDomain,
  BillingPaymentProvider,
  ProviderRefundSource,
  ProviderRefundStatus,
} from '../types/provider-refund.type';

@Entity('provider_refund_operations')
@Index(['orderDomain', 'internalOrderId', 'provider'], {
  unique: true,
})
@Index(['status', 'updatedAt'])
export class ProviderRefundOperation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: BillingOrderDomain,
  })
  orderDomain: BillingOrderDomain;

  @Column({
    type: 'uuid',
  })
  internalOrderId: string;

  @Column({
    type: 'enum',
    enum: BillingPaymentProvider,
  })
  provider: BillingPaymentProvider;

  @Column({
    type: 'varchar',
    length: 255,
  })
  providerOrderId: string;

  @Column({
    type: 'enum',
    enum: ProviderRefundStatus,
    default: ProviderRefundStatus.PENDING,
  })
  status: ProviderRefundStatus;

  @Column({
    type: 'enum',
    enum: ProviderRefundSource,
    default: ProviderRefundSource.ADMIN,
  })
  source: ProviderRefundSource;

  @Column({
    type: 'boolean',
    default: true,
  })
  revoke: boolean;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  reason: string | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  requestedByAdminId: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  providerCompletedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  completedAt: Date | null;

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

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
