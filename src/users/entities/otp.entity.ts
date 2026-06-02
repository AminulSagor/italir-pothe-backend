import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum OtpPurpose {
  ACCOUNT_VERIFICATION = 'account_verification',
  PASSWORD_RESET = 'password_reset',
  CHANGE_EMAIL = 'change_email',
  CHANGE_PHONE = 'change_phone',
}

@Entity('otps')
@Index(['identifier', 'purpose'])
export class Otp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 320 })
  identifier: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: OtpPurpose.ACCOUNT_VERIFICATION,
  })
  purpose: OtpPurpose;

  @Column({ type: 'varchar', length: 255 })
  code: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'integer', default: 0 })
  attemptCount: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
