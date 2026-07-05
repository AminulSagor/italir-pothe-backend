import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  StorePackageStatus,
  StorePackageType,
} from '../types/package-store.type';
import { StorePackageCommerce } from './store-package-commerce.entity';
import { StorePackageEntitlement } from './store-package-entitlement.entity';
import { StorePackageProviderProduct } from './store-package-provider-product.entity';

@Entity('store_packages')
@Index(['packageType', 'status'])
export class StorePackage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'enum',
    enum: StorePackageType,
  })
  packageType: StorePackageType;

  @Column({
    type: 'varchar',
    length: 180,
  })
  name: string;

  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  description: string | null;

  @Column({
    type: 'integer',
    default: 0,
  })
  sortOrder: number;

  @Column({
    type: 'enum',
    enum: StorePackageStatus,
    default: StorePackageStatus.PUBLISHED,
  })
  status: StorePackageStatus;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  publishedAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  archivedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => StorePackageCommerce, (commerce) => commerce.package, {
    cascade: true,
  })
  commerce: StorePackageCommerce;

  @OneToOne(
    () => StorePackageEntitlement,
    (entitlement) => entitlement.package,
    {
      cascade: true,
    },
  )
  entitlement: StorePackageEntitlement;

  @OneToMany(
    () => StorePackageProviderProduct,
    (providerProduct) => providerProduct.package,
    {
      cascade: true,
    },
  )
  providerProducts: StorePackageProviderProduct[];
}
