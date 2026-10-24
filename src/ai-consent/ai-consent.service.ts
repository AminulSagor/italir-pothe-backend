import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';

import { DevicePlatform } from '../devices/enums/device.enums';
import { UserDeviceService } from '../devices/services/user-device.service';
import {
  AI_CONSENT_DATA_CATEGORIES,
  AI_CONSENT_PROVIDERS,
  CURRENT_AI_CONSENT_VERSION,
} from './ai-consent.constants';
import { UserAiConsent } from './entities/user-ai-consent.entity';
import { AiConsentSessionRevocationService } from './ai-consent-session-revocation.service';

@Injectable()
export class AiConsentService {
  private readonly logger = new Logger(AiConsentService.name);

  constructor(
    @InjectRepository(UserAiConsent)
    private readonly consentRepository: Repository<UserAiConsent>,
    private readonly userDeviceService: UserDeviceService,
    private readonly sessionRevocationService: AiConsentSessionRevocationService,
    private readonly dataSource: DataSource,
  ) {}

  async isAuthenticatedLegacyAndroidClient(params: {
    userId: string;
    deviceId?: string;
    sessionId?: string;
  }): Promise<boolean> {
    const deviceId = params.deviceId?.trim();
    const sessionId = params.sessionId?.trim();
    if (!deviceId || !sessionId) return false;

    const device = await this.userDeviceService.assertAuthSessionActive({
      userId: params.userId,
      deviceId,
      sessionId,
    });
    return device.platform === DevicePlatform.ANDROID;
  }

  async status(userId: string) {
    const consent = await this.consentRepository.findOne({ where: { userId } });
    const granted =
      consent?.version === CURRENT_AI_CONSENT_VERSION && !consent.revokedAt;

    return {
      granted,
      version: CURRENT_AI_CONSENT_VERSION,
      grantedAt: granted ? (consent?.grantedAt ?? null) : null,
      providers: [...AI_CONSENT_PROVIDERS],
      dataCategories: [...AI_CONSENT_DATA_CATEGORIES],
      privacyPolicyUrl: 'https://www.italirpothe.com/privacy-policy',
    };
  }

  async grant(userId: string, acceptedVersion: string) {
    if (acceptedVersion !== CURRENT_AI_CONSENT_VERSION) {
      return this.status(userId);
    }

    await this.withConsentLock(userId, async (repository) => {
      const existing = await repository.findOne({
        where: { userId },
      });
      const consent = existing ?? repository.create({ userId });
      consent.version = CURRENT_AI_CONSENT_VERSION;
      consent.providers = [...AI_CONSENT_PROVIDERS];
      consent.dataCategories = [...AI_CONSENT_DATA_CATEGORIES];
      consent.grantedAt = new Date();
      consent.revokedAt = null;
      await repository.save(consent);
    });
    return this.status(userId);
  }

  async revoke(userId: string) {
    await this.withConsentLock(userId, async (repository) => {
      const consent = await repository.findOne({ where: { userId } });
      if (consent && !consent.revokedAt) {
        consent.revokedAt = new Date();
        await repository.save(consent);
      }
    });
    let sessionInvalidation: Awaited<
      ReturnType<AiConsentSessionRevocationService['revokeUserSessions']>
    > | null = null;
    try {
      sessionInvalidation =
        await this.sessionRevocationService.revokeUserSessions(userId);
    } catch {
      this.logger.error(
        'AI consent was revoked but active-session cleanup did not complete; heartbeat and consent checks will reject continued use.',
      );
    }
    return {
      ...(await this.status(userId)),
      sessionInvalidation,
    };
  }

  async hasCurrentConsent(userId: string): Promise<boolean> {
    const consent = await this.consentRepository.findOne({
      where: {
        userId,
        version: CURRENT_AI_CONSENT_VERSION,
        revokedAt: IsNull(),
      },
      select: { id: true },
    });
    return consent !== null;
  }

  private async withConsentLock<T>(
    userId: string,
    operation: (repository: Repository<UserAiConsent>) => Promise<T>,
  ): Promise<T> {
    return this.dataSource.transaction(async (manager) => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        `ai-consent:${userId}`,
      ]);
      return operation(manager.getRepository(UserAiConsent));
    });
  }
}
