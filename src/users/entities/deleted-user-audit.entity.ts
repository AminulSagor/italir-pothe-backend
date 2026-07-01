import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum UserDeletionSource {
  SELF_SERVICE = 'self_service',
  ADMIN_USER_DELETE = 'admin_user_delete',
  ADMIN_ACCOUNT_DELETE = 'admin_account_delete',
}

@Entity('deleted_user_audits')
export class DeletedUserAudit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({
    unique: true,
  })
  @Column({
    type: 'uuid',
  })
  originalUserId: string;

  @Column({
    type: 'varchar',
    length: 120,
    default: 'Deleted User',
  })
  displayName: string;

  @Column({
    type: 'varchar',
    length: 50,
  })
  originalRole: string;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  emailHash: string | null;

  @Column({
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  phoneHash: string | null;

  @Column({
    type: 'uuid',
    nullable: true,
  })
  deletedByUserId: string | null;

  @Column({
    type: 'enum',
    enum: UserDeletionSource,
  })
  deletionSource: UserDeletionSource;

  @CreateDateColumn({
    type: 'timestamptz',
  })
  deletedAt: Date;
}
