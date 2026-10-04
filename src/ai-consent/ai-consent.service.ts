import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import {
  AI_CONSENT_DATA_CATEGORIES,
  AI_CONSENT_PROVIDERS,
  CURRENT_AI_CONSENT_VERSION,
} from './ai-consent.constants';
import { UserAiConsent } from './entities/user-ai-consent.entity';

@Injectable()
export class AiConsentService {
  constructor(
    @InjectRepository(UserAiConsent)
    private readonly consentRepository: Repository<UserAiConsent>,
  ) {}

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

    const existing = await this.consentRepository.findOne({
      where: { userId },
    });
    const consent = existing ?? this.consentRepository.create({ userId });
    consent.version = CURRENT_AI_CONSENT_VERSION;
    consent.providers = [...AI_CONSENT_PROVIDERS];
    consent.dataCategories = [...AI_CONSENT_DATA_CATEGORIES];
    consent.grantedAt = new Date();
    consent.revokedAt = null;
    await this.consentRepository.save(consent);
    return this.status(userId);
  }

  async revoke(userId: string) {
    const consent = await this.consentRepository.findOne({ where: { userId } });
    if (consent && !consent.revokedAt) {
      consent.revokedAt = new Date();
      await this.consentRepository.save(consent);
    }
    return this.status(userId);
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
}
