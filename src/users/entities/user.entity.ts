import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
  LEAD_MODERATOR = 'lead_moderator',
}

@Entity('users')
@Index(['role', 'createdAt'])
@Index(['role', 'isBanned'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 120,
  })
  fullName: string;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  name: string | null;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
    unique: true,
  })
  email: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    nullable: true,
    unique: true,
  })
  phone: string | null;

  @Column({
    type: 'varchar',
    length: 255,
  })
  password: string;

  @Column({
    type: 'enum',
    enum: UserRole,
    default: UserRole.USER,
  })
  role: UserRole;

  @Column({
    type: 'boolean',
    default: false,
  })
  isVerified: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  isEmailVerified: boolean;

  @Column({
    type: 'boolean',
    default: false,
  })
  isPhoneVerified: boolean;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  profilePhotoFileId: string | null;

  @Column({
    type: 'boolean',
    default: false,
  })
  hapticsEnabled: boolean;

  @Column({
    type: 'text',
    nullable: true,
  })
  avatarUrl: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  joinedAt: Date | null;

  @Column({
    type: 'int',
    default: 0,
  })
  currentStreakDays: number;

  @Column({
    type: 'int',
    default: 0,
  })
  totalXp: number;

  @Column({
    type: 'numeric',
    precision: 10,
    scale: 2,
    default: '0.00',
  })
  purchaseValueEur: string;

  @Column({
    type: 'boolean',
    default: false,
  })
  isBanned: boolean;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
