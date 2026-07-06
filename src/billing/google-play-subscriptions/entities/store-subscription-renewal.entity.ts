import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  StoreSubscriptionRenewalEventType,
  StoreSubscriptionRenewalStatus,
} from 'src/billing/types/google-play-subscription.type';

import { StorePaymentProvider } from 'src/package-store/types/package-store.type';

@Entity('store_subscription_renewals')
@Index(['provider', 'providerOrderId'], {
  unique: true,
})
@Index(['subscriptionId', 'periodEnd'])
export class StoreSubscriptionRenewal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  subscriptionId: string;

  @Column({
    type: 'enum',
    enum: StorePaymentProvider,
  })
  provider: StorePaymentProvider;

  @Column({
    type: 'varchar',
    length: 255,
  })
  providerOrderId: string;

  @Column({
    type: 'varchar',
    length: 255,
  })
  productId: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  basePlanId: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  offerId: string | null;

  @Column({
    type: 'enum',
    enum: StoreSubscriptionRenewalEventType,
  })
  eventType: StoreSubscriptionRenewalEventType;

  @Column({
    type: 'enum',
    enum: StoreSubscriptionRenewalStatus,
  })
  status: StoreSubscriptionRenewalStatus;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  periodStart: Date | null;

  @Column({
    type: 'timestamptz',
  })
  periodEnd: Date;

  @Column({
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  priceCurrency: string | null;

  @Column({
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  priceUnits: string | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  priceNanos: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  notificationType: number | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  rtdnEventId: string | null;

  @Column({
    type: 'varchar',
    length: 80,
  })
  rawSubscriptionState: string;

  @Column({
    type: 'boolean',
    default: false,
  })
  isTestPurchase: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
