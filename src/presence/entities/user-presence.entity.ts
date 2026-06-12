import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity('user_presence')
export class Presence {
  @PrimaryColumn('uuid')
  userId: string;

  @Column({
    type: 'varchar',
    length: 25,
    default: 'offline',
    nullable: false,
  })
  status: 'online' | 'offline';

  @Column({
    type: 'timestamp',
  })
  lastHeartbeatAt: Date;

  @Column({ type: 'timestamptz' })
  onlineUntil: Date;

  @Column({ type: 'timestamptz' })
  lastSeenAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
