import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AppUpdatePlatform {
  ANDROID = 'android',
  IOS = 'ios',
}

export enum AppUpdateType {
  OPTIONAL = 'OPTIONAL',
  REQUIRED = 'REQUIRED',
  DISABLED = 'DISABLED',
}

@Entity('app_update_configurations')
@Index(['platform'], { unique: true })
export class AppUpdateConfiguration {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AppUpdatePlatform })
  platform: AppUpdatePlatform;

  @Column({ type: 'varchar', length: 64 })
  latestVersion: string;

  @Column({ type: 'varchar', length: 64 })
  minimumSupportedVersion: string;

  @Column({
    type: 'enum',
    enum: AppUpdateType,
    default: AppUpdateType.DISABLED,
  })
  updateType: AppUpdateType;

  @Column({ type: 'varchar', length: 160 })
  title: string;

  @Column({ type: 'varchar', length: 1200 })
  message: string;

  @Column({ type: 'varchar', length: 1000 })
  storeUrl: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
