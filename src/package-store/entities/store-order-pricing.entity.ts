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

import { CommerceCurrency } from 'src/module-2/course-commerce/types/course-commerce.type';
import { StoreOrder } from './store-order.entity';

@Entity('store_order_pricing')
@Index(['orderId'], {
  unique: true,
})
export class StoreOrderPricing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  basePriceEur: string;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  couponCode: string | null;

  @Column({
    type: 'smallint',
    default: 0,
  })
  discountPercentage: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  discountAmountEur: string;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
  })
  totalAmountEur: string;

  @Column({
    type: 'enum',
    enum: CommerceCurrency,
    default: CommerceCurrency.EUR,
  })
  paymentCurrency: CommerceCurrency;

  @Column({
    type: 'numeric',
    precision: 14,
    scale: 4,
    nullable: true,
  })
  forexRate: string | null;

  @Column({
    type: 'numeric',
    precision: 12,
    scale: 2,
  })
  paymentAmount: string;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => StoreOrder, (order) => order.pricing, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: StoreOrder;
}
