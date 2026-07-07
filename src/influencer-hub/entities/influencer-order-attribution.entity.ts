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
  InfluencerAttributionStatus,
  InfluencerBillingProvider,
  InfluencerCouponOwnerType,
  InfluencerOrderDomain,
} from '../types/influencer-hub.type';
import { InfluencerCoupon } from './influencer-coupon.entity';
import { InfluencerPartner } from './influencer-partner.entity';

@Entity('influencer_order_attributions')
@Index(['orderDomain', 'orderId'], { unique: true })
@Index(['partnerId', 'status', 'createdAt'])
@Index(['couponCode', 'createdAt'])
export class InfluencerOrderAttribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  partnerId: string | null;

  @Column({ type: 'uuid' })
  couponId: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: InfluencerOrderDomain })
  orderDomain: InfluencerOrderDomain;

  @Column({ type: 'uuid' })
  orderId: string;

  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'varchar', length: 80 })
  couponCode: string;

  @Column({ type: 'enum', enum: InfluencerCouponOwnerType })
  ownerType: InfluencerCouponOwnerType;

  @Column({ type: 'enum', enum: InfluencerBillingProvider })
  provider: InfluencerBillingProvider;

  @Column({ type: 'varchar', length: 255 })
  regularProviderProductId: string;

  @Column({ type: 'varchar', length: 255 })
  chargedProviderProductId: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  baseAmountEur: string;

  @Column({ type: 'smallint' })
  discountPercentage: number;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  discountAmountEur: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  payableAmountEur: string;

  @Column({ type: 'smallint', default: 0 })
  influencerSharePercentage: number;

  @Column({ type: 'numeric', precision: 10, scale: 2, default: '0.00' })
  commissionAmountEur: string;

  @Column({
    type: 'enum',
    enum: InfluencerAttributionStatus,
    default: InfluencerAttributionStatus.PENDING,
  })
  status: InfluencerAttributionStatus;

  @Column({ type: 'timestamptz', nullable: true })
  convertedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reversedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => InfluencerPartner, (partner) => partner.attributions, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'partnerId' })
  partner: InfluencerPartner | null;

  @ManyToOne(() => InfluencerCoupon, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'couponId' })
  coupon: InfluencerCoupon;
}
