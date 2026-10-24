import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  S3DeletionJob,
  S3DeletionOperation,
} from '../entities/s3-deletion-job.entity';
import { S3Service } from './s3.service';

const BATCH_SIZE = 25;
const STALE_LOCK_MINUTES = 10;

@Injectable()
export class S3DeletionQueueService {
  private readonly logger = new Logger(S3DeletionQueueService.name);
  private processing = false;

  constructor(
    @InjectRepository(S3DeletionJob)
    private readonly deletionJobRepository: Repository<S3DeletionJob>,
    private readonly s3Service: S3Service,
  ) {}

  @Cron('*/30 * * * * *', { name: 's3-privacy-deletion' })
  async processDueJobs(): Promise<void> {
    if (this.processing) return;
    this.processing = true;
    try {
      for (let index = 0; index < BATCH_SIZE; index += 1) {
        const job = await this.claimNextJob();
        if (!job) return;
        await this.processJob(job);
      }
    } finally {
      this.processing = false;
    }
  }

  private async claimNextJob(): Promise<S3DeletionJob | null> {
    const rows: S3DeletionJob[] = await this.deletionJobRepository.query(
      `
        UPDATE "s3_deletion_jobs"
        SET
          "lockedAt" = now(),
          "attempts" = "attempts" + 1,
          "updatedAt" = now()
        WHERE "id" = (
          SELECT "id"
          FROM "s3_deletion_jobs"
          WHERE "nextAttemptAt" <= now()
            AND (
              "lockedAt" IS NULL
              OR "lockedAt" < now() - ($1::text || ' minutes')::interval
            )
          ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING *
      `,
      [STALE_LOCK_MINUTES],
    );
    return rows[0] ?? null;
  }

  private async processJob(job: S3DeletionJob): Promise<void> {
    try {
      if (job.operation === S3DeletionOperation.PREFIX) {
        await this.s3Service.deletePrefix(job.storageKey);
      } else if (job.operation === S3DeletionOperation.MULTIPART) {
        if (job.uploadId) {
          await this.s3Service.abortMultipartUpload({
            storageKey: job.storageKey,
            uploadId: job.uploadId,
          });
        }
      } else {
        await this.s3Service.deleteObject(job.storageKey);
      }
      await this.deletionJobRepository.delete(job.id);
    } catch (error) {
      if (
        job.operation === S3DeletionOperation.MULTIPART &&
        this.errorName(error) === 'NoSuchUpload'
      ) {
        await this.deletionJobRepository.delete(job.id);
        return;
      }
      const retrySeconds = Math.min(
        24 * 60 * 60,
        30 * 2 ** Math.min(11, Math.max(0, job.attempts - 1)),
      );
      await this.deletionJobRepository.update(job.id, {
        lockedAt: null,
        nextAttemptAt: new Date(Date.now() + retrySeconds * 1000),
        lastError: this.errorName(error),
      });
      this.logger.warn(
        `S3 privacy deletion will be retried (attempt ${job.attempts}).`,
      );
    }
  }

  private errorName(error: unknown): string {
    if (error instanceof Error && error.name.trim()) {
      return error.name.slice(0, 160);
    }
    return 'S3DeletionError';
  }
}
