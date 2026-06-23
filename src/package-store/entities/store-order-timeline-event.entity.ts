import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { StoreTimelineEventType } from '../types/package-store.type';
import { StoreOrder } from './store-order.entity';

@Entity('store_order_timeline_events')
@Index(['orderId', 'occurredAt'])
export class StoreOrderTimelineEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

  @Column({
    type: 'enum',
    enum: StoreTimelineEventType,
  })
  eventType: StoreTimelineEventType;

  @Column({
    type: 'varchar',
    length: 180,
  })
  title: string;

  @Column({
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  description: string | null;

  @Column({
    type: 'jsonb',
    nullable: true,
  })
  metadata: Record<string, unknown> | null;

  @Column({
    type: 'timestamptz',
  })
  occurredAt: Date;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @ManyToOne(() => StoreOrder, (order) => order.timeline, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: StoreOrder;
}
