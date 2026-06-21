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

import { ImportantVerbExampleSource } from "../types/important-verb.type";
import { ImportantVerbConjugation } from "./important-verb-conjugation.entity";
import { ImportantVerbForm } from "./important-verb-form.entity";

@Entity("important_verb_examples")
export class ImportantVerbExample {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  formId: string;

  @ManyToOne(() => ImportantVerbForm, (form) => form.examples, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "formId" })
  form: ImportantVerbForm;

  @Index()
  @Column({ type: "uuid", nullable: true })
  conjugationId: string | null;

  @ManyToOne(
    () => ImportantVerbConjugation,
    (conjugation) => conjugation.examples,
    {
      nullable: true,
      onDelete: "CASCADE",
    },
  )
  @JoinColumn({ name: "conjugationId" })
  conjugation: ImportantVerbConjugation | null;

  @Column({ type: "text" })
  italianText: string;

  @Column({ type: "text", nullable: true })
  englishText: string | null;

  @Column({ type: "text", nullable: true })
  banglaText: string | null;

  @Column({
    type: "enum",
    enum: ImportantVerbExampleSource,
    default: ImportantVerbExampleSource.TEMPLATE,
  })
  source: ImportantVerbExampleSource;

  @Column({ type: "varchar", length: 255, nullable: true })
  sourceReference: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  sourceLicense: string | null;

  @Column({ type: "integer", default: 0 })
  sortOrder: number;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 64, nullable: true })
  sourceHash: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  translationSourceHash: string | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
