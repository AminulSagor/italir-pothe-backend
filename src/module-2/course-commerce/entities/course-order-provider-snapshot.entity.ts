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
  CoursePaymentProvider,
  CourseProviderProductType,
} from '../types/course-commerce.type';
import { CoursePurchaseOrder } from './course-purchase-order.entity';

@Entity('course_order_provider_snapshots')
@Index(['orderId'], {
  unique: true,
})
export class CourseOrderProviderSnapshot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  orderId: string;

  /**
   * ID of the provider-product mapping that was selected
   * when the order was created.
   *
   * This is stored as a snapshot value instead of a relation so old
   * orders remain understandable even if the mapping is deactivated.
   */
  @Column({
    type: 'uuid',
  })
  providerProductId: string;

  @Column({
    type: 'enum',
    enum: CoursePaymentProvider,
  })
  provider: CoursePaymentProvider;

  @Column({
    type: 'varchar',
    length: 255,
  })
  productId: string;

  @Column({
    type: 'enum',
    enum: CourseProviderProductType,
  })
  productType: CourseProviderProductType;

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

  @OneToOne(() => CoursePurchaseOrder, (order) => order.providerSnapshot, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'orderId',
  })
  order: CoursePurchaseOrder;
}
