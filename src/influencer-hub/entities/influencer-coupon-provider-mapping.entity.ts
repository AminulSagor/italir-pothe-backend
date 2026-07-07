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
  InfluencerBillingProvider,
  InfluencerCouponProductDomain,
} from '../types/influencer-hub.type';
import { InfluencerCoupon } from './influencer-coupon.entity';

@Entity('influencer_coupon_provider_mappings')
@Index(['couponId', 'productDomain', 'courseId', 'storePackageId', 'provider'], {
  unique: true,
})
@Index(['productDomain', 'courseId', 'storePackageId', 'provider'])
export class InfluencerCouponProviderMapping {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  couponId: string;

  @Column({ type: 'enum', enum: InfluencerCouponProductDomain })
  productDomain: InfluencerCouponProductDomain;

  @Column({ type: 'uuid', nullable: true })
  courseId: string | null;

  @Column({ type: 'uuid', nullable: true })
  storePackageId: string | null;

  @Column({ type: 'enum', enum: InfluencerBillingProvider })
  provider: InfluencerBillingProvider;

  @Column({ type: 'varchar', length: 255 })
  regularProviderProductId: string;

  @Column({ type: 'varchar', length: 255 })
  discountedProviderProductId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerBasePlanId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerOfferId: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => InfluencerCoupon, (coupon) => coupon.providerMappings, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'couponId' })
  coupon: InfluencerCoupon;
}
