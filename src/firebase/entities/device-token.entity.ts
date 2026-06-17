import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum DevicePlatform {
  ANDROID = 'android',
  IOS = 'ios',
  WEB = 'web',
}

@Entity('device_tokens')
@Index(['token'], { unique: true })
export class DeviceToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  token: string;

  @Column({
    type: 'enum',
    enum: DevicePlatform,
  })
  platform: DevicePlatform;

  @Column({ type: 'varchar', length: 120, nullable: true })
  deviceId: string | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  appVersion: string | null;

  @Column({ type: 'varchar', length: 80, nullable: true })
  timezone: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz' })
  lastSeenAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deactivatedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
