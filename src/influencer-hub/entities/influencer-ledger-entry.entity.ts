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
  InfluencerLedgerStatus,
  InfluencerLedgerTransactionType,
  InfluencerOrderDomain,
} from '../types/influencer-hub.type';
import { InfluencerCoupon } from './influencer-coupon.entity';
import { InfluencerOrderAttribution } from './influencer-order-attribution.entity';
import { InfluencerPartner } from './influencer-partner.entity';

@Entity('influencer_ledger_entries')
@Index(['partnerId', 'status', 'transactionDate'])
@Index(['orderDomain', 'orderId', 'transactionType'])
export class InfluencerLedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  partnerId: string;

  @Column({ type: 'uuid', nullable: true })
  couponId: string | null;

  @Column({ type: 'uuid', nullable: true })
  attributionId: string | null;

  @Column({ type: 'enum', enum: InfluencerOrderDomain, nullable: true })
  orderDomain: InfluencerOrderDomain | null;

  @Column({ type: 'uuid', nullable: true })
  orderId: string | null;

  @Column({ type: 'enum', enum: InfluencerLedgerTransactionType })
  transactionType: InfluencerLedgerTransactionType;

  @Column({ type: 'varchar', length: 120 })
  referenceId: string;

  @Column({ type: 'numeric', precision: 10, scale: 2 })
  amountEur: string;

  @Column({
    type: 'enum',
    enum: InfluencerLedgerStatus,
    default: InfluencerLedgerStatus.PENDING,
  })
  status: InfluencerLedgerStatus;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz' })
  transactionDate: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => InfluencerPartner, (partner) => partner.ledgerEntries, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'partnerId' })
  partner: InfluencerPartner;

  @ManyToOne(() => InfluencerCoupon, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'couponId' })
  coupon: InfluencerCoupon | null;

  @ManyToOne(() => InfluencerOrderAttribution, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'attributionId' })
  attribution: InfluencerOrderAttribution | null;
}
