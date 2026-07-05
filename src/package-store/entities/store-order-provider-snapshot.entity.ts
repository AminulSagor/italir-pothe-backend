import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import {
  StorePaymentProvider,
  StoreProviderProductType,
} from '../types/package-store.type';
import { StoreOrder } from './store-order.entity';

@Entity('store_order_provider_snapshots')
@Index(['orderId'], {
  unique: true,
})
export class StoreOrderProviderSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

  @Column({
    type: 'uuid',
  })
  providerProductId: string;

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

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @OneToOne(() => StoreOrder, (order) => order.providerSnapshot, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: StoreOrder;
}
