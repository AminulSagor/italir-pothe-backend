import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import {
  ImportantVerbAuxiliary,
  ImportantVerbEndingType,
  ImportantVerbRegularity,
} from "../types/important-verb.type";
import { ImportantVerbForm } from "./important-verb-form.entity";

@Entity("important_verbs")
export class ImportantVerb {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 180 })
  infinitive: string;

  @Index({ unique: true })
  @Column({ type: "varchar", length: 200 })
  slug: string;

  @Column({ type: "text", nullable: true })
  englishMeaning: string | null;

  @Column({ type: "text", nullable: true })
  banglaMeaning: string | null;

  @Column({ type: "text", nullable: true })
  italianMeaning: string | null;

  @Index()
  @Column({
    type: "enum",
    enum: ImportantVerbRegularity,
    default: ImportantVerbRegularity.REGULAR,
  })
  regularity: ImportantVerbRegularity;

  @Index()
  @Column({
    type: "enum",
    enum: ImportantVerbEndingType,
    default: ImportantVerbEndingType.OTHER,
  })
  endingType: ImportantVerbEndingType;

  @Column({
    type: "enum",
    enum: ImportantVerbAuxiliary,
    default: ImportantVerbAuxiliary.UNKNOWN,
  })
  auxiliary: ImportantVerbAuxiliary;

  @Column({ type: "jsonb", default: () => "'[]'::jsonb" })
  tags: string[];

  @Column({ type: "integer", nullable: true })
  frequencyRank: number | null;

  @Column({ type: "integer", default: 0 })
  sortOrder: number;

  @Index()
  @Column({ type: "boolean", default: true })
  isPublished: boolean;

  @Column({ type: "varchar", length: 64, nullable: true })
  sourceHash: string | null;

  @Column({ type: "varchar", length: 64, nullable: true })
  translationSourceHash: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  sourceVersion: string | null;

  @OneToMany(() => ImportantVerbForm, (form) => form.verb, {
    cascade: true,
  })
  forms: ImportantVerbForm[];

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
