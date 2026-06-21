import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from "typeorm";

import { ImportantVerbFormKey } from "../types/important-verb.type";
import { ImportantVerbConjugation } from "./important-verb-conjugation.entity";
import { ImportantVerbExample } from "./important-verb-example.entity";
import { ImportantVerb } from "./important-verb.entity";

@Entity("important_verb_forms")
@Unique(["verbId", "formKey"])
export class ImportantVerbForm {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  verbId: string;

  @ManyToOne(() => ImportantVerb, (verb) => verb.forms, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "verbId" })
  verb: ImportantVerb;

  @Index()
  @Column({
    type: "enum",
    enum: ImportantVerbFormKey,
  })
  formKey: ImportantVerbFormKey;

  @Column({ type: "varchar", length: 120 })
  titleEn: string;

  @Column({ type: "varchar", length: 160 })
  titleBn: string;

  @Column({ type: "varchar", length: 160 })
  titleIt: string;

  @Column({ type: "text", nullable: true })
  descriptionEn: string | null;

  @Column({ type: "text", nullable: true })
  descriptionBn: string | null;

  @Column({ type: "text", nullable: true })
  descriptionIt: string | null;

  @Column({ type: "boolean", default: false })
  isCompound: boolean;

  @Column({ type: "integer", default: 0 })
  sortOrder: number;

  @Column({ type: "varchar", length: 64, nullable: true })
  sourceHash: string | null;

  @OneToMany(
    () => ImportantVerbConjugation,
    (conjugation) => conjugation.form,
    {
      cascade: true,
    },
  )
  conjugations: ImportantVerbConjugation[];

  @OneToMany(() => ImportantVerbExample, (example) => example.form, {
    cascade: true,
  })
  examples: ImportantVerbExample[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
