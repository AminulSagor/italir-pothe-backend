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
  StorePaymentProvider,
  StoreProviderProductType,
} from '../types/package-store.type';
import { StorePackage } from './store-package.entity';

@Entity('store_package_provider_products')
@Index(['provider', 'productId'], {
  unique: true,
})
@Index(['packageId', 'provider', 'isActive'])
export class StorePackageProviderProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  packageId: string;

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
    type: 'enum',
    enum: StoreProviderProductType,
  })
  productType: StoreProviderProductType;

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

  @ManyToOne(
    () => StorePackage,
    (storePackage) => storePackage.providerProducts,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({
    name: 'packageId',
  })
  package: StorePackage;
}
