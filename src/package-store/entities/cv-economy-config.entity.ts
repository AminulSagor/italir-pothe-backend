import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cv_economy_configs')
export class CvEconomyConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({
    unique: true,
  })
  @Column({
    type: 'varchar',
    length: 50,
    default: 'default',
  })
  configKey: string;

  @Column({
    type: 'integer',
    default: 2,
  })
  freeCreditsPerSignup: number;

  @Column({
    type: 'boolean',
    default: true,
  })
  allowEditingWithoutCredit: boolean;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  updatedByAdminId: string | null;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  createdAt: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
  })
  updatedAt: Date;
}
