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
@Index('UQ_otps_reset_token_hash', ['resetTokenHash'], {
  unique: true,
  where: '"resetTokenHash" IS NOT NULL',
})
export class Otp {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    type: 'varchar',
    length: 320,
    nullable: true,
  })
  identifier: string;

  @Column({
    type: 'varchar',
    length: 50,
    default: OtpPurpose.ACCOUNT_VERIFICATION,
  })
  purpose: OtpPurpose;

  @Column({
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  code: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  expiresAt: Date;

  @Column({
    type: 'integer',
    default: 0,
  })
  attemptCount: number;

  /*
   * Only the SHA-256 hash is stored.
   * The real reset token is returned once to Flutter.
   */
  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  resetTokenHash: string | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  resetTokenExpiresAt: Date | null;

  @Column({
    type: 'timestamptz',
    nullable: true,
  })
  verifiedAt: Date | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;
}
