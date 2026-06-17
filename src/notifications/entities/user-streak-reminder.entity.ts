import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum StreakReminderType {
  TEN_HOURS = 'ten_hours',
  SIX_HOURS = 'six_hours',
  THREE_HOURS = 'three_hours',
  ONE_HOUR = 'one_hour',
  THIRTY_MINUTES = 'thirty_minutes',
}

@Entity('user_streak_reminders')
@Index(['userId', 'reminderDate', 'reminderType'], { unique: true })
export class UserStreakReminder {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'date' })
  reminderDate: string;

  @Column({
    type: 'enum',
    enum: StreakReminderType,
  })
  reminderType: StreakReminderType;

  @Column({ type: 'timestamptz' })
  sentAt: Date;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
