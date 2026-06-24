import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from 'src/users/entities/user.entity';
import { StoreOrderStatus } from '../types/package-store.type';
import { StorePackage } from './store-package.entity';
import { StoreOrderPackageSnapshot } from './store-order-package-snapshot.entity';
import { StoreOrderPayment } from './store-order-payment.entity';
import { StoreOrderPricing } from './store-order-pricing.entity';
import { StoreOrderReversal } from './store-order-reversal.entity';
import { StoreOrderTimelineEvent } from './store-order-timeline-event.entity';

@Entity('store_orders')
@Index(['userId', 'idempotencyKey'], {
  unique: true,
})
export class StoreOrder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({
    unique: true,
  })
  @Column({
    type: 'varchar',
    length: 40,
  })
  orderNumber: string;

  @Index()
  @Column({
    type: 'uuid',
  })
  userId: string;

  @Index()
  @Column({
    type: 'uuid',
  })
  packageId: string;

  @Column({
    type: 'uuid',
  })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: StoreOrderStatus,
    default: StoreOrderStatus.PENDING,
  })
  status: StoreOrderStatus;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @ManyToOne(() => User, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User;

  @ManyToOne(() => StorePackage, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'packageId',
  })
  package: StorePackage;

  @OneToOne(() => StoreOrderPackageSnapshot, (snapshot) => snapshot.order, {
    cascade: true,
  })
  snapshot: StoreOrderPackageSnapshot;

  @OneToOne(() => StoreOrderPricing, (pricing) => pricing.order, {
    cascade: true,
  })
  pricing: StoreOrderPricing;

  @OneToOne(() => StoreOrderPayment, (payment) => payment.order, {
    cascade: true,
  })
  payment: StoreOrderPayment;

  @OneToOne(() => StoreOrderReversal, (reversal) => reversal.order, {
    cascade: true,
  })
  reversal: StoreOrderReversal;

  @OneToMany(
    () => StoreOrderTimelineEvent,
    (timelineEvent) => timelineEvent.order,
    {
      cascade: true,
    },
  )
  timeline: StoreOrderTimelineEvent[];
}
