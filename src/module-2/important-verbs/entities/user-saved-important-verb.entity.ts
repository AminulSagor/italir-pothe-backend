import {
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Column,
  Unique,
} from "typeorm";

import { ImportantVerb } from "./important-verb.entity";

@Entity("user_saved_important_verbs")
@Unique(["userId", "verbId"])
export class UserSavedImportantVerb {
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

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;
}
