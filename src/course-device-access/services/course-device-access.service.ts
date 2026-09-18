import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { DataSource, Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { LessThan } from 'typeorm';

import {
  Course,
  CourseStatus,
} from '../../module-2/courses/entities/course.entity';
import { User } from '../../users/entities/user.entity';
import {
  AdminCourseDeviceRequestsQueryDto,
  CreateCourseDeviceChallengeDto,
  DecideCourseDeviceRequestDto,
  VerifyCourseDeviceDto,
} from '../dto/course-device-access.dto';
import { CourseDeviceAuthorization } from '../entities/course-device-authorization.entity';
import { CourseDeviceChallenge } from '../entities/course-device-challenge.entity';
import { CourseDeviceRequest } from '../entities/course-device-request.entity';
import {
  CourseDeviceAuthorizationStatus,
  CourseDevicePlatform,
  CourseDeviceRequestDecision,
  CourseDeviceRequestStatus,
} from '../enums/course-device-access.enums';
import { CourseDeviceAttestationService } from './course-device-attestation.service';

@Injectable()
export class CourseDeviceAccessService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly attestation: CourseDeviceAttestationService,
    @InjectRepository(CourseDeviceAuthorization)
    private readonly authorizationRepository: Repository<CourseDeviceAuthorization>,
    @InjectRepository(CourseDeviceChallenge)
    private readonly challengeRepository: Repository<CourseDeviceChallenge>,
    @InjectRepository(CourseDeviceRequest)
    private readonly requestRepository: Repository<CourseDeviceRequest>,
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  @Cron('0 3 * * *')
  async removeExpiredChallenges(): Promise<void> {
    await this.challengeRepository.delete({
      expiresAt: LessThan(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    });
  }

  async createChallenge(
    userId: string,
    courseId: string,
    dto: CreateCourseDeviceChallengeDto,
  ) {
    const course = await this.courseRepository.findOne({
      where: { id: courseId, status: CourseStatus.PUBLISHED },
      select: { id: true },
    });
    if (!course) throw new NotFoundException('Course not found.');

    const deviceKeyId = dto.deviceKeyId.trim();
    const deviceLabel = dto.deviceLabel.trim();
    const challenge = randomBytes(32).toString('base64url');
    const entity = this.challengeRepository.create({
      userId,
      courseId,
      platform: dto.platform,
      deviceKeyId,
      deviceLabel,
      challengeHash: this.hash(challenge),
      clientDataBase64: '',
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      consumedAt: null,
    });
    await this.challengeRepository.save(entity);

    const clientData = Buffer.from(
      JSON.stringify({
        action: 'course_device_access',
        challengeId: entity.id,
        challenge,
        courseId,
        deviceKeyId,
      }),
      'utf8',
    );
    entity.clientDataBase64 = clientData.toString('base64');
    await this.challengeRepository.save(entity);

    const known = await this.authorizationRepository.findOne({
      where: { userId, deviceKeyId },
    });

    return {
      challengeId: entity.id,
      clientDataBase64: entity.clientDataBase64,
      expiresAt: entity.expiresAt,
      requiresAttestation: !known,
    };
  }

  async verifyDevice(
    userId: string,
    courseId: string,
    dto: VerifyCourseDeviceDto,
  ) {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const challengeRepository = manager.getRepository(CourseDeviceChallenge);
      const authorizationRepository = manager.getRepository(
        CourseDeviceAuthorization,
      );
      const requestRepository = manager.getRepository(CourseDeviceRequest);

      const challenge = await challengeRepository.findOne({
        where: { id: dto.challengeId, userId, courseId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!challenge || challenge.deviceKeyId !== dto.deviceKeyId.trim()) {
        throw new ForbiddenException('The device challenge is invalid.');
      }
      if (challenge.consumedAt || challenge.expiresAt <= new Date()) {
        throw new ForbiddenException(
          'The device challenge has expired or was already used.',
        );
      }
      challenge.consumedAt = new Date();
      await challengeRepository.save(challenge);

      const clientData = Buffer.from(challenge.clientDataBase64, 'base64');
      let authorization = await authorizationRepository.findOne({
        where: { userId, courseId, deviceKeyId: challenge.deviceKeyId },
        lock: { mode: 'pessimistic_write' },
      });
      const knownDeviceKey =
        authorization ??
        (await authorizationRepository.findOne({
          where: { userId, deviceKeyId: challenge.deviceKeyId },
          order: { lastVerifiedAt: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        }));
      const otherUserKey = await authorizationRepository
        .createQueryBuilder('authorization')
        .where('authorization.deviceKeyId = :deviceKeyId', {
          deviceKeyId: challenge.deviceKeyId,
        })
        .andWhere('authorization.userId <> :userId', { userId })
        .getOne();
      if (otherUserKey) {
        throw new ForbiddenException(
          'This attested device key is already associated with another account.',
        );
      }

      if (challenge.platform === CourseDevicePlatform.ANDROID) {
        if (
          !dto.attestationToken ||
          !dto.publicKeyPem ||
          !dto.signatureBase64
        ) {
          throw new BadRequestException(
            'Play Integrity token, device public key, and signature are required.',
          );
        }
        const verified = await this.attestation.verifyAndroid({
          token: dto.attestationToken,
          publicKeyPem: dto.publicKeyPem,
          signatureBase64: dto.signatureBase64,
          clientData,
        });
        if (knownDeviceKey) {
          this.assertSamePublicKey(
            knownDeviceKey.publicKeyPem,
            verified.publicKeyPem,
          );
        }
        if (!authorization) {
          authorization = authorizationRepository.create({
            userId,
            courseId,
            deviceKeyId: challenge.deviceKeyId,
            deviceLabel: challenge.deviceLabel,
            platform: challenge.platform,
            status: CourseDeviceAuthorizationStatus.CANDIDATE,
            publicKeyPem: verified.publicKeyPem,
            attestationReceipt: knownDeviceKey?.attestationReceipt ?? null,
            assertionCounter: 0,
            activatedAt: null,
            revokedAt: null,
            lastVerifiedAt: new Date(),
          });
        }
      } else {
        if (!authorization && !knownDeviceKey) {
          if (!dto.attestationToken) {
            throw new BadRequestException(
              'A new iOS device requires an App Attest attestation object.',
            );
          }
          const verified = await this.attestation.verifyAppleAttestation({
            keyId: challenge.deviceKeyId,
            attestationObjectBase64: dto.attestationToken,
            clientData,
          });
          authorization = authorizationRepository.create({
            userId,
            courseId,
            deviceKeyId: challenge.deviceKeyId,
            deviceLabel: challenge.deviceLabel,
            platform: challenge.platform,
            status: CourseDeviceAuthorizationStatus.CANDIDATE,
            publicKeyPem: verified.publicKeyPem,
            attestationReceipt: verified.receipt,
            assertionCounter: 0,
            activatedAt: null,
            revokedAt: null,
            lastVerifiedAt: new Date(),
          });
        } else {
          if (!dto.assertionBase64) {
            throw new BadRequestException(
              'An App Attest assertion is required.',
            );
          }
          const assertionAuthorization = authorization ?? knownDeviceKey!;
          const counter = this.attestation.verifyAppleAssertion({
            authorization: assertionAuthorization,
            assertionBase64: dto.assertionBase64,
            clientData,
          });
          assertionAuthorization.assertionCounter = counter;
          assertionAuthorization.lastVerifiedAt = new Date();
          await authorizationRepository.save(assertionAuthorization);
          if (!authorization) {
            authorization = authorizationRepository.create({
              userId,
              courseId,
              deviceKeyId: challenge.deviceKeyId,
              deviceLabel: challenge.deviceLabel,
              platform: challenge.platform,
              status: CourseDeviceAuthorizationStatus.CANDIDATE,
              publicKeyPem: assertionAuthorization.publicKeyPem,
              attestationReceipt: assertionAuthorization.attestationReceipt,
              assertionCounter: counter,
              activatedAt: null,
              revokedAt: null,
              lastVerifiedAt: new Date(),
              accessTokenHash: null,
              accessTokenExpiresAt: null,
            });
          }
        }
      }

      authorization.deviceLabel = challenge.deviceLabel;
      authorization.lastVerifiedAt = new Date();
      authorization = await authorizationRepository.save(authorization);

      const active = await authorizationRepository.find({
        where: {
          userId,
          courseId,
          status: CourseDeviceAuthorizationStatus.ACTIVE,
        },
        order: { activatedAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      const currentIsActive = active.some(
        (item) => item.id === authorization!.id,
      );
      if (currentIsActive) {
        return this.createAuthorizedSession(
          authorization,
          authorizationRepository,
        );
      }

      if (active.length === 0) {
        authorization.status = CourseDeviceAuthorizationStatus.ACTIVE;
        authorization.activatedAt = new Date();
        authorization.revokedAt = null;
        await authorizationRepository.save(authorization);
        return this.createAuthorizedSession(
          authorization,
          authorizationRepository,
        );
      }

      const pending = await requestRepository.findOne({
        where: {
          userId,
          courseId,
          requestedAuthorizationId: authorization.id,
          status: CourseDeviceRequestStatus.PENDING,
        },
      });

      return {
        authorized: false,
        code: 'DEVICE_LIMIT_REACHED',
        currentDeviceLabel: active[0].deviceLabel,
        requestedDeviceLabel: authorization.deviceLabel,
        requestStatus: pending?.status ?? null,
      };
    });
  }

  async createRequest(userId: string, courseId: string, deviceKeyId: string) {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const authorizationRepository = manager.getRepository(
        CourseDeviceAuthorization,
      );
      const requestRepository = manager.getRepository(CourseDeviceRequest);
      const requested = await authorizationRepository.findOne({
        where: { userId, courseId, deviceKeyId: deviceKeyId.trim() },
        lock: { mode: 'pessimistic_write' },
      });
      const recentVerificationCutoff = new Date(Date.now() - 10 * 60 * 1000);
      if (
        !requested?.lastVerifiedAt ||
        requested.lastVerifiedAt < recentVerificationCutoff
      ) {
        throw new ForbiddenException(
          'Verify this device again before requesting access.',
        );
      }
      if (requested.status === CourseDeviceAuthorizationStatus.ACTIVE) {
        throw new BadRequestException('This device already has course access.');
      }

      const current = await authorizationRepository.findOne({
        where: {
          userId,
          courseId,
          status: CourseDeviceAuthorizationStatus.ACTIVE,
        },
        order: { activatedAt: 'ASC' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current)
        throw new ConflictException('No current device needs replacement.');

      const existing = await requestRepository.findOne({
        where: {
          userId,
          courseId,
          requestedAuthorizationId: requested.id,
          status: CourseDeviceRequestStatus.PENDING,
        },
      });
      if (existing) return this.mapRequest(existing);

      const request = await requestRepository.save(
        requestRepository.create({
          userId,
          courseId,
          currentAuthorizationId: current.id,
          requestedAuthorizationId: requested.id,
          status: CourseDeviceRequestStatus.PENDING,
          decidedByUserId: null,
          decidedAt: null,
        }),
      );
      return this.mapRequest(request);
    });
  }

  async findAdminRequests(query: AdminCourseDeviceRequestsQueryDto) {
    const builder = this.requestRepository
      .createQueryBuilder('request')
      .leftJoinAndSelect('request.user', 'user')
      .leftJoinAndSelect('request.course', 'course')
      .leftJoinAndSelect('request.currentAuthorization', 'currentAuthorization')
      .leftJoinAndSelect(
        'request.requestedAuthorization',
        'requestedAuthorization',
      )
      .orderBy('request.createdAt', 'DESC');
    if (query.status)
      builder.andWhere('request.status = :status', { status: query.status });
    const search = query.search?.trim().toLowerCase();
    if (search) {
      builder.andWhere(
        `(LOWER(COALESCE(user."fullName", user.name, '')) LIKE :search OR LOWER(COALESCE(user.email, '')) LIKE :search OR LOWER(COALESCE(user.phone, '')) LIKE :search OR LOWER(course.title) LIKE :search)`,
        { search: `%${search}%` },
      );
    }
    return {
      items: (await builder.getMany()).map((item) =>
        this.mapAdminRequest(item),
      ),
    };
  }

  async decideRequest(
    adminUserId: string,
    requestId: string,
    dto: DecideCourseDeviceRequestDto,
  ) {
    return this.dataSource.transaction('SERIALIZABLE', async (manager) => {
      const requestRepository = manager.getRepository(CourseDeviceRequest);
      const authorizationRepository = manager.getRepository(
        CourseDeviceAuthorization,
      );
      const request = await requestRepository.findOne({
        where: { id: requestId },
        relations: [
          'user',
          'course',
          'currentAuthorization',
          'requestedAuthorization',
        ],
        lock: { mode: 'pessimistic_write' },
      });
      if (!request) throw new NotFoundException('Device request not found.');
      if (request.status !== CourseDeviceRequestStatus.PENDING) {
        throw new ConflictException(
          'This device request has already been decided.',
        );
      }

      const requested = await authorizationRepository.findOne({
        where: { id: request.requestedAuthorizationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!requested)
        throw new ConflictException('The requested device no longer exists.');
      const now = new Date();

      if (dto.decision === CourseDeviceRequestDecision.REPLACE) {
        const active = await authorizationRepository.find({
          where: {
            userId: request.userId,
            courseId: request.courseId,
            status: CourseDeviceAuthorizationStatus.ACTIVE,
          },
          lock: { mode: 'pessimistic_write' },
        });
        for (const item of active) {
          if (item.id === requested.id) continue;
          item.status = CourseDeviceAuthorizationStatus.REVOKED;
          item.revokedAt = now;
        }
        if (active.length) await authorizationRepository.save(active);
        requested.status = CourseDeviceAuthorizationStatus.ACTIVE;
        requested.activatedAt = now;
        requested.revokedAt = null;
        request.status = CourseDeviceRequestStatus.APPROVED_REPLACE;
      } else if (dto.decision === CourseDeviceRequestDecision.ADD) {
        requested.status = CourseDeviceAuthorizationStatus.ACTIVE;
        requested.activatedAt = now;
        requested.revokedAt = null;
        request.status = CourseDeviceRequestStatus.APPROVED_ADD;
      } else {
        request.status = CourseDeviceRequestStatus.REJECTED;
      }

      if (dto.decision !== CourseDeviceRequestDecision.REJECT) {
        await authorizationRepository.save(requested);
      }
      request.decidedByUserId = adminUserId;
      request.decidedAt = now;
      await requestRepository.save(request);
      return { ok: true, id: request.id, status: request.status };
    });
  }

  async assertCourseAccess(params: {
    userId: string;
    courseId: string;
    deviceKeyId: string;
    accessToken: string;
  }): Promise<void> {
    const authorization = await this.authorizationRepository.findOne({
      where: {
        userId: params.userId,
        courseId: params.courseId,
        deviceKeyId: params.deviceKeyId,
        status: CourseDeviceAuthorizationStatus.ACTIVE,
      },
    });
    if (
      !authorization?.accessTokenHash ||
      !authorization.accessTokenExpiresAt ||
      authorization.accessTokenExpiresAt <= new Date() ||
      authorization.accessTokenHash !== this.hash(params.accessToken)
    ) {
      throw new ForbiddenException({
        code: 'COURSE_DEVICE_ACCESS_REQUIRED',
        message: 'A current verified device proof is required for this course.',
      });
    }
  }

  private async createAuthorizedSession(
    authorization: CourseDeviceAuthorization,
    repository: Repository<CourseDeviceAuthorization>,
  ) {
    const accessToken = randomBytes(32).toString('base64url');
    authorization.accessTokenHash = this.hash(accessToken);
    authorization.accessTokenExpiresAt = new Date(
      Date.now() + 12 * 60 * 60 * 1000,
    );
    await repository.save(authorization);
    return {
      authorized: true,
      code: 'AUTHORIZED',
      deviceLabel: authorization.deviceLabel,
      authorizedAt: authorization.activatedAt,
      accessToken,
      accessTokenExpiresAt: authorization.accessTokenExpiresAt,
    };
  }

  private mapRequest(request: CourseDeviceRequest) {
    return {
      id: request.id,
      status: request.status,
      createdAt: request.createdAt,
    };
  }

  private mapAdminRequest(request: CourseDeviceRequest) {
    return {
      id: request.id,
      user: {
        id: request.userId,
        name: request.user?.fullName || request.user?.name || 'Unknown user',
        email: request.user?.email ?? null,
        phone: request.user?.phone ?? null,
      },
      course: {
        id: request.courseId,
        title: request.course?.title ?? 'Unknown course',
      },
      currentDeviceLabel:
        request.currentAuthorization?.deviceLabel ?? 'No active device',
      requestedDeviceLabel:
        request.requestedAuthorization?.deviceLabel ?? 'Unknown device',
      requestedAt: request.createdAt,
      status: request.status,
      decidedAt: request.decidedAt,
    };
  }

  private assertSamePublicKey(storedPem: string, suppliedPem: string) {
    if (this.hash(storedPem) !== this.hash(suppliedPem)) {
      throw new ForbiddenException(
        'The device key does not match its verified registration.',
      );
    }
  }

  private hash(value: string) {
    return createHash('sha256').update(value).digest('base64url');
  }
}
