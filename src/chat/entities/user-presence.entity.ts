import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { PresenceStatus } from '../enums/chat.enums';
import { UserDevice } from 'src/devices/entities/user-device.entity';

@Entity('user_presence')
@Index('IDX_user_presence_status', ['status'])
@Index('IDX_user_presence_onlineUntil', ['onlineUntil'])
export class UserPresence {
  @PrimaryColumn({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({
    name: 'userId',
  })
  user: User | null;

  @Column({
    type: 'enum',
    enum: PresenceStatus,
    default: PresenceStatus.OFFLINE,
  })
  status: PresenceStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastHeartbeatAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  onlineUntil: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastSeenAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  activeDeviceId: string | null;

  @ManyToOne(() => UserDevice, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'activeDeviceId' })
  activeDevice: UserDevice | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
