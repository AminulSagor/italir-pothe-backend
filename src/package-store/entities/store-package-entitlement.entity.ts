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

import { StreakProtectionMode } from '../types/package-store.type';
import { StorePackage } from './store-package.entity';

@Entity('store_package_entitlements')
@Index(['packageId'], {
  unique: true,
})
export class StorePackageEntitlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'uuid',
  })
  packageId: string;

  @Column({
    type: 'integer',
    nullable: true,
  })
  voiceMinutes: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  textTokens: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  freezeCount: number | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  cvCreditCount: number | null;

  @Column({
    type: 'enum',
    enum: StreakProtectionMode,
    nullable: true,
  })
  streakProtectionMode: StreakProtectionMode | null;

  @Column({
    type: 'integer',
    nullable: true,
  })
  protectionDurationDays: number | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;

  @OneToOne(() => StorePackage, (storePackage) => storePackage.entitlement, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'packageId',
  })
  package: StorePackage;
}
