import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  StoreBillingModel,
  StoreMarketingBadge,
  StorePackageType,
  StreakProtectionMode,
} from '../types/package-store.type';
import { StoreOrder } from './store-order.entity';

@Entity('store_order_package_snapshots')
@Index(['orderId'], {
  unique: true,
})
export class StoreOrderPackageSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

  @Column({
    type: 'enum',
    enum: StorePackageType,
  })
  packageType: StorePackageType;

  @Column({
    type: 'varchar',
    length: 180,
  })
  packageName: string;

  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  packageDescription: string | null;

  @Column({
    type: 'enum',
    enum: StoreBillingModel,
  })
  billingModel: StoreBillingModel;

  @Column({
    type: 'enum',
    enum: StoreMarketingBadge,
  })
  marketingBadge: StoreMarketingBadge;

  @Column({
    type: 'integer',
    nullable: true,
  })
  voiceMinutes: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  textTokens: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  freezeCount: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  cvCreditCount: number | null;

  @Column({
    type: 'enum',
    enum: StreakProtectionMode,
    nullable: true,
  })
  streakProtectionMode: StreakProtectionMode | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  protectionDurationDays: number | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @OneToOne(() => StoreOrder, (order) => order.snapshot, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: StoreOrder;
}
