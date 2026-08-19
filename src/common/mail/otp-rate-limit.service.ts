import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac } from 'crypto';
import { DataSource, LessThan, MoreThanOrEqual, Repository } from 'typeorm';

import { OtpPurpose } from '../../users/entities/otp.entity';
import {
  OtpRateLimitAction,
  OtpRateLimitEvent,
} from './entities/otp-rate-limit-event.entity';

interface OtpRateLimitRequest {
  identifier?: string;
  ipAddress?: string;
  purpose: OtpPurpose;
}

@Injectable()
export class OtpRateLimitService {
  constructor(
    @InjectRepository(OtpRateLimitEvent)
    private readonly eventRepository: Repository<OtpRateLimitEvent>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async recordSendRequest(request: OtpRateLimitRequest): Promise<void> {
    const identifierHash = this.hash(
      this.normalizeIdentifier(request.identifier ?? 'unknown'),
    );
    const ipHash = this.hash(this.normalizeIp(request.ipAddress));
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`otp-send:${identifierHash}:${request.purpose}`],
      );
      const repository = manager.getRepository(OtpRateLimitEvent);
      const commonIdentifierWhere = {
        identifierHash,
        purpose: request.purpose,
        action: OtpRateLimitAction.DELIVERY,
      };

      const latest = await repository.findOne({
        where: {
          ...commonIdentifierWhere,
          createdAt: MoreThanOrEqual(dayAgo),
        },
        order: { createdAt: 'DESC' },
      });

      const cooldownSeconds = this.getLimit(
        'OTP_RESEND_COOLDOWN_SECONDS',
        60,
      );
      if (latest) {
        const retryAfter = Math.ceil(
          cooldownSeconds - (now.getTime() - latest.createdAt.getTime()) / 1000,
        );
        if (retryAfter > 0) {
          this.throwRateLimit(retryAfter);
        }
      }

      const [identifierHourly, identifierDaily] = await Promise.all([
        repository.count({
          where: {
            ...commonIdentifierWhere,
            createdAt: MoreThanOrEqual(hourAgo),
          },
        }),
        repository.count({
          where: {
            ...commonIdentifierWhere,
            createdAt: MoreThanOrEqual(dayAgo),
          },
        }),
      ]);

      if (
        identifierHourly >= this.getLimit('OTP_IDENTIFIER_HOURLY_LIMIT', 5) ||
        identifierDaily >= this.getLimit('OTP_IDENTIFIER_DAILY_LIMIT', 10)
      ) {
        this.throwRateLimit(60);
      }

      const event = repository.create({
        identifierHash,
        ipHash,
        purpose: request.purpose,
        action: OtpRateLimitAction.DELIVERY,
      });

      await repository.save(event);
    });
  }

  async recordSendEndpointAttempt(
    request: OtpRateLimitRequest,
  ): Promise<void> {
    const ipHash = this.hash(this.normalizeIp(request.ipAddress));
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`otp-send-ip:${ipHash}`],
      );

      const repository = manager.getRepository(OtpRateLimitEvent);
      const [hourly, daily] = await Promise.all([
        repository.count({
          where: {
            ipHash,
            action: OtpRateLimitAction.SEND,
            createdAt: MoreThanOrEqual(hourAgo),
          },
        }),
        repository.count({
          where: {
            ipHash,
            action: OtpRateLimitAction.SEND,
            createdAt: MoreThanOrEqual(dayAgo),
          },
        }),
      ]);

      if (
        hourly >= this.getLimit('OTP_IP_HOURLY_SEND_LIMIT', 20) ||
        daily >= this.getLimit('OTP_IP_DAILY_SEND_LIMIT', 100)
      ) {
        this.throwRateLimit(60);
      }

      await repository.save(
        repository.create({
          identifierHash: null,
          ipHash,
          purpose: request.purpose,
          action: OtpRateLimitAction.SEND,
        }),
      );
    });
  }

  async recordVerificationAttempt(
    request: OtpRateLimitRequest,
  ): Promise<void> {
    const ipHash = this.hash(this.normalizeIp(request.ipAddress));
    const identifierHash = request.identifier
      ? this.hash(this.normalizeIdentifier(request.identifier))
      : null;
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`otp-verify-ip:${ipHash}`],
      );

      const repository = manager.getRepository(OtpRateLimitEvent);
      const [hourly, daily] = await Promise.all([
        repository.count({
          where: {
            ipHash,
            action: OtpRateLimitAction.VERIFY,
            createdAt: MoreThanOrEqual(hourAgo),
          },
        }),
        repository.count({
          where: {
            ipHash,
            action: OtpRateLimitAction.VERIFY,
            createdAt: MoreThanOrEqual(dayAgo),
          },
        }),
      ]);

      if (
        hourly >= this.getLimit('OTP_IP_HOURLY_VERIFY_LIMIT', 60) ||
        daily >= this.getLimit('OTP_IP_DAILY_VERIFY_LIMIT', 200)
      ) {
        this.throwRateLimit(60);
      }

      await repository.save(
        repository.create({
          identifierHash,
          ipHash,
          purpose: request.purpose,
          action: OtpRateLimitAction.VERIFY,
        }),
      );
    });
  }

  @Cron('0 0 3 * * *')
  async cleanupExpiredEvents(): Promise<void> {
    await this.eventRepository.delete({
      createdAt: LessThan(new Date(Date.now() - 48 * 60 * 60 * 1000)),
    });
  }

  private throwRateLimit(retryAfterSeconds: number): never {
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many verification requests. Please try again later.',
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getLimit(key: string, fallback: number): number {
    const configured = Number(this.configService.get<string>(key));
    return Number.isInteger(configured) && configured > 0
      ? configured
      : fallback;
  }

  private hash(value: string): string {
    const secret =
      this.configService.get<string>('OTP_RATE_LIMIT_HASH_SECRET')?.trim() ||
      this.configService.get<string>('JWT_SECRET')?.trim();

    if (!secret) {
      throw new Error('OTP rate-limit hash secret is not configured');
    }

    return createHmac('sha256', secret).update(value).digest('hex');
  }

  private normalizeIdentifier(identifier: string): string {
    const normalized = identifier.trim();
    return normalized.includes('@') ? normalized.toLowerCase() : normalized;
  }

  private normalizeIp(ipAddress?: string): string {
    return ipAddress?.trim() || 'unknown';
  }
}
