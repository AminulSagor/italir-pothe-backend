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

import { StoreOrder } from './store-order.entity';

@Entity('store_order_reversals')
@Index(['orderId'], {
  unique: true,
})
export class StoreOrderReversal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

  @Column({
    type: 'integer',
    default: 0,
  })
  reversedVoiceMinutes: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  reversedTextTokens: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  reversedFreezeCount: number;

  @Column({
    type: 'integer',
    default: 0,
  })
  reversedCvCredits: number;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  unlimitedProtectionPreviousUntil: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  unlimitedProtectionGrantedUntil: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => StoreOrder, (order) => order.reversal, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: StoreOrder;
}
