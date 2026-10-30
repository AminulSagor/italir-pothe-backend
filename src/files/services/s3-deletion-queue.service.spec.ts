import { Repository } from 'typeorm';

import {
  S3DeletionJob,
  S3DeletionOperation,
} from '../entities/s3-deletion-job.entity';
import { S3DeletionQueueService } from './s3-deletion-queue.service';
import { S3Service } from './s3.service';

describe('S3DeletionQueueService', () => {
  const jobId = '11111111-1111-4111-8111-111111111111';

  function createJob(overrides: Partial<S3DeletionJob> = {}): S3DeletionJob {
    return {
      id: jobId,
      batchId: '22222222-2222-4222-8222-222222222222',
      operation: S3DeletionOperation.OBJECT,
      storageKey: 'private/object-key',
      uploadId: null,
      attempts: 1,
      nextAttemptAt: new Date('2026-10-31T00:00:00Z'),
      lockedAt: new Date('2026-10-31T00:00:00Z'),
      lastError: null,
      createdAt: new Date('2026-10-31T00:00:00Z'),
      updatedAt: new Date('2026-10-31T00:00:00Z'),
      ...overrides,
    };
  }

  function createService(firstQueryResult: unknown) {
    const query = jest
      .fn()
      .mockResolvedValueOnce(firstQueryResult)
      .mockResolvedValue([[], 0]);
    const deleteJob = jest.fn().mockResolvedValue({ affected: 1 });
    const updateJob = jest.fn().mockResolvedValue({ affected: 1 });
    const repository = {
      query,
      delete: deleteJob,
      update: updateJob,
    } as unknown as Repository<S3DeletionJob>;
    const deleteObject = jest.fn().mockResolvedValue(undefined);
    const s3Service = {
      deleteObject,
      deletePrefix: jest.fn().mockResolvedValue(undefined),
      abortMultipartUpload: jest.fn().mockResolvedValue(undefined),
    } as unknown as S3Service;

    return {
      service: new S3DeletionQueueService(repository, s3Service),
      query,
      deleteJob,
      updateJob,
      deleteObject,
    };
  }

  it('unwraps the Postgres UPDATE result before processing the claimed job', async () => {
    const job = createJob();
    const fixture = createService([[job], 1]);

    await fixture.service.processDueJobs();

    expect(fixture.deleteObject).toHaveBeenCalledWith(job.storageKey);
    expect(fixture.deleteJob).toHaveBeenCalledWith(jobId);
    expect(fixture.updateJob).not.toHaveBeenCalled();
  });

  it('releases a failed job for retry using its UUID', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-31T00:00:00Z'));
    const job = createJob({ attempts: 2 });
    const fixture = createService([[job], 1]);
    const s3Error = Object.assign(new Error('request failed'), {
      name: 'ServiceUnavailable',
    });
    fixture.deleteObject.mockRejectedValueOnce(s3Error);

    await fixture.service.processDueJobs();

    expect(fixture.updateJob).toHaveBeenCalledWith(jobId, {
      lockedAt: null,
      nextAttemptAt: new Date('2026-10-31T00:01:00Z'),
      lastError: 'ServiceUnavailable',
    });
    expect(fixture.deleteJob).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it.each([undefined, '', 'not-a-uuid'])(
    'does not process or mutate a claimed job with id %p',
    async (id) => {
      const job = createJob({ id: id as string });
      const fixture = createService([[job], 1]);
      const logger = (
        fixture.service as unknown as {
          logger: { error: jest.Mock };
        }
      ).logger;
      jest.spyOn(logger, 'error').mockImplementation();

      await fixture.service.processDueJobs();

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('without a valid identifier'),
      );
      expect(fixture.deleteObject).not.toHaveBeenCalled();
      expect(fixture.updateJob).not.toHaveBeenCalled();
      expect(fixture.deleteJob).not.toHaveBeenCalled();
    },
  );
});
