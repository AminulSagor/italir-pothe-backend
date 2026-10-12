import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import { Course } from '../../module-2/courses/entities/course.entity';
import { CourseEnrollment } from '../../module-2/course-commerce/entities/course-enrollment.entity';
import {
  CourseAccessType,
  CourseEnrollmentStatus,
} from '../../module-2/course-commerce/types/course-commerce.type';
import { CourseDeviceAuthorization } from '../entities/course-device-authorization.entity';
import { CourseDeviceChallenge } from '../entities/course-device-challenge.entity';
import { CourseDeviceRequest } from '../entities/course-device-request.entity';
import {
  CourseDeviceAuthorizationStatus,
  CourseDevicePlatform,
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
      { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService,
      unusedRepository as Repository<CourseDeviceAuthorization>,
      unusedRepository as Repository<CourseDeviceChallenge>,
      unusedRepository as Repository<CourseDeviceRequest>,
      unusedRepository as never,
      unusedRepository as Repository<CourseEnrollment>,
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

  it('bypasses Play Integrity when device enforcement is disabled', async () => {
    const transaction = jest.fn();
    const dataSource = {
      transaction,
    } as unknown as DataSource;
    const verifyAndroid = jest.fn();
    const attestation = {
      verifyAndroid,
    } as unknown as CourseDeviceAttestationService;
    const unusedRepository = {} as Repository<never>;
    const service = new CourseDeviceAccessService(
      dataSource,
      attestation,
      { get: jest.fn().mockReturnValue('false') } as unknown as ConfigService,
      unusedRepository as Repository<CourseDeviceAuthorization>,
      unusedRepository as Repository<CourseDeviceChallenge>,
      unusedRepository as Repository<CourseDeviceRequest>,
      unusedRepository as never,
      unusedRepository as Repository<CourseEnrollment>,
    );

    const result = await service.verifyDevice('user-id', 'course-id', {
      challengeId: '00000000-0000-4000-8000-000000000000',
      deviceKeyId: 'device-key-id',
    });

    expect(result).toMatchObject({
      authorized: true,
      code: 'ENFORCEMENT_DISABLED',
    });
    expect(typeof result.accessToken).toBe('string');

    expect(transaction).not.toHaveBeenCalled();
    expect(verifyAndroid).not.toHaveBeenCalled();
  });

  it('bypasses device binding for free courses', async () => {
    const transaction = jest.fn();
    const dataSource = {
      transaction,
    } as unknown as DataSource;
    const verifyAndroid = jest.fn();
    const attestation = {
      verifyAndroid,
    } as unknown as CourseDeviceAttestationService;
    const courseRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'course-id',
        isFree: true,
      }),
    } as unknown as Repository<Course>;
    const unusedRepository = {} as Repository<never>;
    const service = new CourseDeviceAccessService(
      dataSource,
      attestation,
      { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService,
      unusedRepository as Repository<CourseDeviceAuthorization>,
      unusedRepository as Repository<CourseDeviceChallenge>,
      unusedRepository as Repository<CourseDeviceRequest>,
      courseRepository,
      unusedRepository as Repository<CourseEnrollment>,
    );

    const result = await service.verifyDevice('user-id', 'course-id', {
      challengeId: '00000000-0000-4000-8000-000000000000',
      deviceKeyId: 'device-key-id',
    });

    expect(result).toMatchObject({
      authorized: true,
      code: 'FREE_COURSE',
    });
    expect(typeof result.accessToken).toBe('string');

    expect(transaction).not.toHaveBeenCalled();
    expect(verifyAndroid).not.toHaveBeenCalled();
  });

  it('does not create a device challenge for a free course', async () => {
    const saveChallenge = jest.fn();
    const challengeRepository = {
      save: saveChallenge,
    } as unknown as Repository<CourseDeviceChallenge>;
    const courseRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'course-id',
        isFree: true,
      }),
    } as unknown as Repository<Course>;
    const unusedRepository = {} as Repository<never>;
    const service = new CourseDeviceAccessService(
      {} as DataSource,
      {} as CourseDeviceAttestationService,
      { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService,
      unusedRepository as Repository<CourseDeviceAuthorization>,
      challengeRepository,
      unusedRepository as Repository<CourseDeviceRequest>,
      courseRepository,
      unusedRepository as Repository<CourseEnrollment>,
    );

    await expect(
      service.createChallenge('user-id', 'course-id', {
        platform: CourseDevicePlatform.ANDROID,
        deviceKeyId: 'device-key-id',
        deviceLabel: 'Test phone',
      }),
    ).resolves.toEqual({
      code: 'FREE_COURSE',
      enforcementEnabled: false,
    });

    expect(saveChallenge).not.toHaveBeenCalled();
  });

  it('requires device binding for paid courses', async () => {
    const courseRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'course-id',
        isFree: false,
      }),
    } as unknown as Repository<Course>;
    const unusedRepository = {} as Repository<never>;
    const enrollmentRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'enrollment-id',
        accessType: CourseAccessType.LIFETIME,
        status: CourseEnrollmentStatus.ACTIVE,
        expiresAt: null,
      }),
    } as unknown as Repository<CourseEnrollment>;
    const service = new CourseDeviceAccessService(
      {} as DataSource,
      {} as CourseDeviceAttestationService,
      { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService,
      unusedRepository as Repository<CourseDeviceAuthorization>,
      unusedRepository as Repository<CourseDeviceChallenge>,
      unusedRepository as Repository<CourseDeviceRequest>,
      courseRepository,
      enrollmentRepository,
    );

    await expect(
      service.requiresCourseDeviceAccess('course-id', 'user-id'),
    ).resolves.toBe(true);
  });

  it('bypasses device binding while a paid course is only a preview', async () => {
    const saveChallenge = jest.fn();
    const challengeRepository = {
      save: saveChallenge,
    } as unknown as Repository<CourseDeviceChallenge>;
    const courseRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'course-id',
        isFree: false,
      }),
    } as unknown as Repository<Course>;
    const enrollmentRepository = {
      findOne: jest.fn().mockResolvedValue(null),
    } as unknown as Repository<CourseEnrollment>;
    const unusedRepository = {} as Repository<never>;
    const service = new CourseDeviceAccessService(
      {} as DataSource,
      {} as CourseDeviceAttestationService,
      { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService,
      unusedRepository as Repository<CourseDeviceAuthorization>,
      challengeRepository,
      unusedRepository as Repository<CourseDeviceRequest>,
      courseRepository,
      enrollmentRepository,
    );

    await expect(
      service.createChallenge('user-id', 'course-id', {
        platform: CourseDevicePlatform.ANDROID,
        deviceKeyId: 'device-key-id',
        deviceLabel: 'Test phone',
      }),
    ).resolves.toEqual({
      code: 'ENFORCEMENT_DISABLED',
      enforcementEnabled: false,
    });

    const verification = await service.verifyDevice('user-id', 'course-id', {
      challengeId: '00000000-0000-4000-8000-000000000000',
      deviceKeyId: 'device-key-id',
    });

    expect(saveChallenge).not.toHaveBeenCalled();
    expect(verification).toMatchObject({
      authorized: true,
      code: 'ENFORCEMENT_DISABLED',
    });
    expect(typeof verification.accessToken).toBe('string');
  });

  it('does not require binding after time-limited access expires', async () => {
    const courseRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'course-id',
        isFree: false,
      }),
    } as unknown as Repository<Course>;
    const enrollmentRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'enrollment-id',
        accessType: CourseAccessType.TIME_LIMITED,
        status: CourseEnrollmentStatus.ACTIVE,
        expiresAt: new Date(Date.now() - 60_000),
      }),
    } as unknown as Repository<CourseEnrollment>;
    const unusedRepository = {} as Repository<never>;
    const service = new CourseDeviceAccessService(
      {} as DataSource,
      {} as CourseDeviceAttestationService,
      { get: jest.fn().mockReturnValue('true') } as unknown as ConfigService,
      unusedRepository as Repository<CourseDeviceAuthorization>,
      unusedRepository as Repository<CourseDeviceChallenge>,
      unusedRepository as Repository<CourseDeviceRequest>,
      courseRepository,
      enrollmentRepository,
    );

    await expect(
      service.requiresCourseDeviceAccess('course-id', 'user-id'),
    ).resolves.toBe(false);
  });
});
