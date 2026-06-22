import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { ImportantVerb } from "./important-verb.entity";

@Entity("user_important_verb_progress")
@Index(["userId", "verbId"], { unique: true })
export class UserImportantVerbProgress {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  userId: string;

  @Index()
  @Column({ type: "uuid" })
  verbId: string;

  @ManyToOne(() => ImportantVerb, { onDelete: "CASCADE" })
  @JoinColumn({ name: "verbId" })
  verb: ImportantVerb;

  @Column({ type: "integer", default: 1 })
  reviewCount: number;

  @Column({ type: "timestamptz" })
  lastReviewedAt: Date;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
