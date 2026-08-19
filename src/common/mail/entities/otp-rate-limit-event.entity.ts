import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum OtpRateLimitAction {
  SEND = 'send',
  DELIVERY = 'delivery',
  VERIFY = 'verify',
}

@Entity('otp_rate_limit_events')
@Index('IDX_otp_rate_identifier_window', [
  'identifierHash',
  'purpose',
  'action',
  'createdAt',
])
@Index('IDX_otp_rate_ip_window', ['ipHash', 'action', 'createdAt'])
@Index('IDX_otp_rate_created_at', ['createdAt'])
export class OtpRateLimitEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  identifierHash: string | null;

  @Column({ type: 'varchar', length: 64 })
  ipHash: string;

  @Column({ type: 'varchar', length: 50 })
  purpose: string;

  @Column({ type: 'varchar', length: 20 })
  action: OtpRateLimitAction;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
