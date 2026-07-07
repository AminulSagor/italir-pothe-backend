import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  InfluencerCouponOwnerType,
  InfluencerCouponStatus,
} from '../types/influencer-hub.type';
import { InfluencerCouponProviderMapping } from './influencer-coupon-provider-mapping.entity';
import { InfluencerPartner } from './influencer-partner.entity';

@Entity('influencer_coupons')
@Index(['couponCode'], { unique: true })
@Index(['status', 'startsAt', 'expiresAt'])
export class InfluencerCoupon {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  partnerId: string | null;

  @Column({ type: 'varchar', length: 80 })
  couponCode: string;

  @Column({
    type: 'enum',
    enum: InfluencerCouponOwnerType,
    default: InfluencerCouponOwnerType.INFLUENCER,
  })
  ownerType: InfluencerCouponOwnerType;

  @Column({ type: 'smallint' })
  userDiscountPercentage: number;

  @Column({ type: 'smallint', default: 0 })
  influencerSharePercentage: number;

  @Column({ type: 'boolean', default: true })
  lifetimeAssociationEnabled: boolean;

  @Column({
    type: 'enum',
    enum: InfluencerCouponStatus,
    default: InfluencerCouponStatus.ACTIVE,
  })
  status: InfluencerCouponStatus;

  @Column({ type: 'timestamptz', nullable: true })
  startsAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => InfluencerPartner, (partner) => partner.coupons, {
    nullable: true,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'partnerId' })
  partner: InfluencerPartner | null;

  @OneToMany(() => InfluencerCouponProviderMapping, (mapping) => mapping.coupon, {
    cascade: true,
  })
  providerMappings: InfluencerCouponProviderMapping[];
}
