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

import { InfluencerSocialPlatform } from '../types/influencer-hub.type';
import { InfluencerPartner } from './influencer-partner.entity';

@Entity('influencer_social_handles')
@Index(['partnerId', 'platform', 'handle'], { unique: true })
export class InfluencerSocialHandle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  partnerId: string;

  @Column({ type: 'enum', enum: InfluencerSocialPlatform })
  platform: InfluencerSocialPlatform;

  @Column({ type: 'varchar', length: 180 })
  handle: string;

  @Column({ type: 'text', nullable: true })
  url: string | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne(() => InfluencerPartner, (partner) => partner.socialHandles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'partnerId' })
  partner: InfluencerPartner;
}
