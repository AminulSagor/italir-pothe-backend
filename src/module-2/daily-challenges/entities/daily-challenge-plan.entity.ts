import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

@Entity('daily_challenge_plans')
export class DailyChallengePlan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'date' })
  challengeDate: string;

  @Column({ type: 'varchar', length: 80 })
  variationKey: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
