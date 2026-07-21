import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';
import { DeviceAppState, DevicePlatform } from '../enums/device.enums';

@Entity('user_devices')
@Index('IDX_user_devices_userId', ['userId'])
@Index('IDX_user_devices_deviceId', ['deviceId'])
@Index('IDX_user_devices_fcmToken', ['fcmToken'])
@Index('UQ_user_devices_auth_session_id', ['authSessionId'], {
  unique: true,
  where: '"authSessionId" IS NOT NULL',
})
@Unique('UQ_user_devices_user_device', ['userId', 'deviceId'])
export class UserDevice {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User | null;

  @Column({
    type: 'varchar',
    length: 120,
  })
  deviceId: string;

  @Column({
    type: 'enum',
    enum: DevicePlatform,
  })
  platform: DevicePlatform;

  @Column({
    type: 'enum',
    enum: DeviceAppState,
    default: DeviceAppState.FOREGROUND,
  })
  appState: DeviceAppState;

  @Column({
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  fcmToken: string | null;

  @Column({
    type: 'varchar',
    length: 512,
    nullable: true,
  })
  voipToken: string | null;

  @Column({
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  appVersion: string | null;

  @Column({
    type: 'varchar',
    length: 80,
    nullable: true,
  })
  timezone: string | null;

  @Column({
    type: 'boolean',
    default: true,
  })
  isActive: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  lastActiveAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  deactivatedAt: Date | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  authSessionId: string | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  isSessionActive: boolean;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  authSessionExpiresAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
