import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  StorePaymentProvider,
  StoreProviderEnvironment,
} from 'src/package-store/types/package-store.type';
import {
  GooglePlayDeveloperCancellationType,
  StoreSubscriptionEntitlementStatus,
  StoreSubscriptionStatus,
} from 'src/billing/types/google-play-subscription.type';

@Entity('store_subscriptions')
@Index(['initialOrderId'], {
  unique: true,
})
@Index(['purchaseTokenHash'], {
  unique: true,
})
@Index(['userId', 'entitlementActive', 'expiresAt'])
@Index(['latestOrderId'])
@Index(['status', 'expiresAt'])
export class StoreSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  userId: string;

  @Column({
    type: 'uuid',
  })
  packageId: string;

  @Column({
    type: 'uuid',
  })
  initialOrderId: string;

  @Column({
    type: 'enum',
    enum: StorePaymentProvider,
  })
  provider: StorePaymentProvider;

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
    type: 'varchar',
    length: 64,
  })
  purchaseTokenHash: string;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  linkedPurchaseTokenHash: string | null;

  @Column({
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  previousPurchaseTokenHashes: string[];

  /*
   * Never store the raw purchase token.
   * These three columns contain AES-256-GCM encrypted data.
   */
  @Column({
    type: 'text',
  })
  tokenCiphertext: string;

  @Column({
    type: 'varchar',
    length: 64,
  })
  tokenIv: string;

  @Column({
    type: 'varchar',
    length: 64,
  })
  tokenAuthTag: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  latestOrderId: string | null;

  @Column({
    type: 'enum',
    enum: StoreSubscriptionStatus,
  })
  status: StoreSubscriptionStatus;

  @Column({
    type: 'varchar',
    length: 80,
  })
  rawSubscriptionState: string;

  @Column({
    type: 'enum',
    enum: StoreSubscriptionEntitlementStatus,
  })
  entitlementStatus: StoreSubscriptionEntitlementStatus;

  @Column({
    type: 'boolean',
    default: false,
  })
  entitlementActive: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  autoRenewEnabled: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  startedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  expiresAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  pausedResumeAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  canceledAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  revokedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  expiredAt: Date | null;

  @Column({
    type: 'enum',
    enum: StoreProviderEnvironment,
  })
  environment: StoreProviderEnvironment;

  @Column({
    type: 'boolean',
    default: false,
  })
  isTestPurchase: boolean;

  @Column({
    type: 'varchar',
    length: 8,
    nullable: true,
  })
  regionCode: string | null;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  cancellationReason: string | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  lastNotificationType: number | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  lastRtdnEventId: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastEventTime: Date | null;

  @Column({
    type: 'timestamptz',
  })
  lastSyncedAt: Date;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  cancelRequestedAt: Date | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  cancelRequestedByAdminId: string | null;

  @Column({
    type: 'enum',
    enum: GooglePlayDeveloperCancellationType,
    nullable: true,
  })
  cancelRequestType: GooglePlayDeveloperCancellationType | null;

  /*
   * Sanitized Developer API response.
   * It must not contain purchase tokens, email,
   * profile name or direct Google account data.
   */
  @Column({
    type: 'jsonb',
    nullable: true,
  })
  latestPayload: Record<string, unknown> | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
