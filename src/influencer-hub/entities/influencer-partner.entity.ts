import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import {
  InfluencerPaymentMethod,
  InfluencerPartnerStatus,
} from '../types/influencer-hub.type';
import { InfluencerCoupon } from './influencer-coupon.entity';
import { InfluencerLedgerEntry } from './influencer-ledger-entry.entity';
import { InfluencerOrderAttribution } from './influencer-order-attribution.entity';
import { InfluencerSocialHandle } from './influencer-social-handle.entity';

@Entity('influencer_partners')
@Index(['status', 'createdAt'])
export class InfluencerPartner {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 180 })
  fullName: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 160, nullable: true })
  title: string | null;

  @Column({ type: 'text', nullable: true })
  avatarUrl: string | null;

  @Column({
    type: 'enum',
    enum: InfluencerPartnerStatus,
    default: InfluencerPartnerStatus.ACTIVE,
  })
  status: InfluencerPartnerStatus;

  @Column({
    type: 'enum',
    enum: InfluencerPaymentMethod,
    default: InfluencerPaymentMethod.BANK_TRANSFER,
  })
  paymentMethod: InfluencerPaymentMethod;

  @Column({ type: 'jsonb', nullable: true })
  paymentDetails: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 180, nullable: true })
  paymentDisplayLabel: string | null;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Column({ type: 'text', nullable: true })
  administrativeNotes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastActivityAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany(() => InfluencerSocialHandle, (handle) => handle.partner, {
    cascade: true,
  })
  socialHandles: InfluencerSocialHandle[];

  @OneToMany(() => InfluencerCoupon, (coupon) => coupon.partner, {
    cascade: true,
  })
  coupons: InfluencerCoupon[];

  @OneToMany(() => InfluencerOrderAttribution, (item) => item.partner)
  attributions: InfluencerOrderAttribution[];

  @OneToMany(() => InfluencerLedgerEntry, (item) => item.partner)
  ledgerEntries: InfluencerLedgerEntry[];
}
