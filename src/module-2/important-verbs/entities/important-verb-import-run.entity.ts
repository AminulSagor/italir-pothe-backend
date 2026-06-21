import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from "typeorm";

import { ImportantVerbImportRunStatus } from "../types/important-verb.type";
import type { ImportantVerbImportMetrics } from "../types/important-verb.type";

@Entity("important_verb_import_runs")
export class ImportantVerbImportRun {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({
    type: "enum",
    enum: ImportantVerbImportRunStatus,
    default: ImportantVerbImportRunStatus.RUNNING,
  })
  status: ImportantVerbImportRunStatus;

  @Column({ type: "varchar", length: 255, nullable: true })
  kaikkiSource: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  unimorphSource: string | null;

  @Column({ type: "varchar", length: 255, nullable: true })
  tatoebaSource: string | null;

  @Column({ type: "varchar", length: 120, nullable: true })
  sourceVersion: string | null;

  @Column({ type: "jsonb", default: () => "'{}'::jsonb" })
  metrics: ImportantVerbImportMetrics;

  @Column({ type: "text", nullable: true })
  errorMessage: string | null;

  @Column({ type: "timestamptz", nullable: true })
  startedAt: Date | null;

  @Column({ type: "timestamptz", nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ type: "timestamptz" })
  createdAt: Date;

  @UpdateDateColumn({ type: "timestamptz" })
  updatedAt: Date;
}
