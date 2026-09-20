import { DataSource, Repository } from 'typeorm';

import { CourseDeviceAuthorization } from '../entities/course-device-authorization.entity';
import { CourseDeviceChallenge } from '../entities/course-device-challenge.entity';
import { CourseDeviceRequest } from '../entities/course-device-request.entity';
import {
  CourseDeviceAuthorizationStatus,
  CourseDeviceRequestDecision,
  CourseDeviceRequestStatus,
} from '../enums/course-device-access.enums';
import { CourseDeviceAccessService } from './course-device-access.service';
import { CourseDeviceAttestationService } from './course-device-attestation.service';

jest.mock('../../module-2/courses/entities/course.entity', () => ({
  Course: class Course {},
  CourseStatus: { PUBLISHED: 'published' },
}));

describe('CourseDeviceAccessService admin decisions', () => {
  it('locks only the request row so PostgreSQL does not lock outer joins', async () => {
    const request = {
      id: 'request-id',
      userId: 'user-id',
      courseId: 'course-id',
      requestedAuthorizationId: 'requested-authorization-id',
      status: CourseDeviceRequestStatus.PENDING,
      decidedByUserId: null,
      decidedAt: null,
    } as CourseDeviceRequest;
    const requested = {
      id: request.requestedAuthorizationId,
      status: CourseDeviceAuthorizationStatus.CANDIDATE,
      activatedAt: null,
      revokedAt: null,
    } as CourseDeviceAuthorization;
    const requestRepository = {
      findOne: jest.fn().mockResolvedValue(request),
      save: jest
        .fn()
        .mockImplementation((value: CourseDeviceRequest) =>
          Promise.resolve(value),
        ),
    };
    const authorizationRepository = {
      findOne: jest.fn().mockResolvedValue(requested),
      save: jest
        .fn()
        .mockImplementation((value: CourseDeviceAuthorization) =>
          Promise.resolve(value),
        ),
    };
    const manager = {
      getRepository: jest.fn((entity) =>
        entity === CourseDeviceRequest
          ? requestRepository
          : authorizationRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn(
        (_isolation: string, callback: (value: typeof manager) => unknown) =>
          Promise.resolve(callback(manager)),
      ),
    } as unknown as DataSource;
    const unusedRepository = {} as Repository<never>;
    const service = new CourseDeviceAccessService(
      dataSource,
      {} as CourseDeviceAttestationService,
      unusedRepository as Repository<CourseDeviceAuthorization>,
      unusedRepository as Repository<CourseDeviceChallenge>,
      unusedRepository as Repository<CourseDeviceRequest>,
      unusedRepository as never,
    );

    await expect(
      service.decideRequest('admin-id', request.id, {
        decision: CourseDeviceRequestDecision.ADD,
      }),
    ).resolves.toEqual({
      ok: true,
      id: request.id,
      status: CourseDeviceRequestStatus.APPROVED_ADD,
    });

    expect(requestRepository.findOne).toHaveBeenCalledWith({
      where: { id: request.id },
      lock: { mode: 'pessimistic_write' },
    });
    expect(requested.status).toBe(CourseDeviceAuthorizationStatus.ACTIVE);
    expect(requestRepository.save).toHaveBeenCalledWith(request);
  });
});
