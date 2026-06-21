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

import { ImportantVerbPersonKey } from "../types/important-verb.type";
import { ImportantVerbExample } from "./important-verb-example.entity";
import { ImportantVerbForm } from "./important-verb-form.entity";

@Entity("important_verb_conjugations")
@Unique(["formId", "personKey"])
export class ImportantVerbConjugation {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index()
  @Column({ type: "uuid" })
  formId: string;

  @ManyToOne(() => ImportantVerbForm, (form) => form.conjugations, {
    onDelete: "CASCADE",
  })
  @JoinColumn({ name: "formId" })
  form: ImportantVerbForm;

  @Index()
  @Column({
    type: "enum",
    enum: ImportantVerbPersonKey,
    default: ImportantVerbPersonKey.BASE,
  })
  personKey: ImportantVerbPersonKey;

  @Column({ type: "varchar", length: 80, nullable: true })
  pronounIt: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  pronounEn: string | null;

  @Column({ type: "varchar", length: 80, nullable: true })
  pronounBn: string | null;

  @Column({ type: "varchar", length: 240 })
  conjugatedText: string;

  @Column({ type: "text", nullable: true })
  englishMeaning: string | null;

  @Column({ type: "text", nullable: true })
  banglaMeaning: string | null;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  sourceTags: string[];

  @Column({ type: "integer", default: 0 })
  sortOrder: number;

  @Column({ type: "varchar", length: 64, nullable: true })
  sourceHash: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  translationSourceHash: string | null;

  @OneToMany(() => ImportantVerbExample, (example) => example.conjugation, {
    cascade: true,
  })
  examples: ImportantVerbExample[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
