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

import { StorePaymentProvider } from '../types/package-store.type';
import { StoreOrder } from './store-order.entity';

@Entity('store_order_payments')
@Index(['orderId'], {
  unique: true,
})
@Index(['provider', 'providerReference'], {
  unique: true,
})
export class StoreOrderPayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

  @Column({
    type: 'enum',
    enum: StorePaymentProvider,
  })
  provider: StorePaymentProvider;

  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  providerReference: string | null;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  failureCode: string | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  failureMessage: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  paidAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  refundedAt: Date | null;

  @Column({
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  refundReason: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => StoreOrder, (order) => order.payment, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: StoreOrder;
}
