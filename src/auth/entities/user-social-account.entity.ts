import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { User } from '../../users/entities/user.entity';

export enum SocialAuthProvider {
  GOOGLE = 'google',
  FACEBOOK = 'facebook',
}

@Entity('user_social_accounts')
@Index(
  'UQ_user_social_accounts_provider_user',
  ['provider', 'providerUserId'],
  {
    unique: true,
  },
)
@Index('UQ_user_social_accounts_user_provider', ['userId', 'provider'], {
  unique: true,
})
export class UserSocialAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'enum', enum: SocialAuthProvider })
  provider: SocialAuthProvider;

  @Column({ type: 'varchar', length: 255 })
  providerUserId: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  providerEmail: string | null;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
