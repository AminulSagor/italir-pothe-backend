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
  StoreBillingModel,
  StoreMarketingBadge,
} from '../types/package-store.type';
import { StorePackage } from './store-package.entity';

@Entity('store_package_commerce')
@Index(['packageId'], {
  unique: true,
})
export class StorePackageCommerce {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  packageId: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  priceEur: string;

  @Column({
    type: 'enum',
    enum: StoreBillingModel,
    default: StoreBillingModel.ONE_TIME,
  })
  billingModel: StoreBillingModel;

  @Column({
    type: 'enum',
    enum: StoreMarketingBadge,
    default: StoreMarketingBadge.NONE,
  })
  marketingBadge: StoreMarketingBadge;

  @Column({
    type: 'boolean',
    default: false,
  })
  couponsEnabled: boolean;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  couponCode: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => StorePackage, (storePackage) => storePackage.commerce, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'packageId',
  })
  package: StorePackage;
}
