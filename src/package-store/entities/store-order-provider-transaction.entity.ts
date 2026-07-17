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
  StorePaymentProvider,
  StoreProviderEnvironment,
  StoreProviderVerificationStatus,
} from '../types/package-store.type';
import { StoreOrder } from './store-order.entity';

@Entity('store_order_provider_transactions')
@Index(['orderId'], {
  unique: true,
})
@Index(['provider', 'tokenHash'], {
  unique: true,
})
@Index(['provider', 'providerTransactionId'], {
  unique: true,
})
export class StoreOrderProviderTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

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
    length: 64,
    nullable: true,
  })
  obfuscatedAccountId: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  tokenHash: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerTransactionId: string | null;

  @Column({
    type: 'enum',
    enum: StoreProviderEnvironment,
    default: StoreProviderEnvironment.DEVELOPMENT,
  })
  environment: StoreProviderEnvironment;

  @Column({
    type: 'enum',
    enum: StoreProviderVerificationStatus,
    default: StoreProviderVerificationStatus.PENDING,
  })
  verificationStatus: StoreProviderVerificationStatus;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  verifiedAt: Date | null;

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

  @OneToOne(() => StoreOrder, (order) => order.providerTransaction, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: StoreOrder;
}
