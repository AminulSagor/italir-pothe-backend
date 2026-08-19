import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { Repository } from 'typeorm';

import {
  EmailSuppression,
  EmailSuppressionReason,
} from './entities/email-suppression.entity';

@Injectable()
export class EmailSuppressionService {
  private readonly logger = new Logger(EmailSuppressionService.name);

  constructor(
    @InjectRepository(EmailSuppression)
    private readonly suppressionRepository: Repository<EmailSuppression>,
  ) {}

  async isSuppressed(email: string): Promise<boolean> {
    return this.suppressionRepository.exists({
      where: { email: this.normalizeEmail(email) },
    });
  }

  async suppress(params: {
    email: string;
    reason: EmailSuppressionReason;
    sourceEventId?: string;
    correlationId?: string;
    details?: string;
  }): Promise<void> {
    const email = this.normalizeEmail(params.email);

    await this.suppressionRepository.upsert(
      {
        email,
        reason: params.reason,
        sourceEventId: params.sourceEventId?.slice(0, 255) || null,
        details: params.details?.slice(0, 500) || null,
        suppressedAt: new Date(),
      },
      ['email'],
    );

    this.logger.warn(
      `Suppressed email recipientHash=${this.recipientHash(email)} reason=${params.reason} correlationId=${params.correlationId ?? 'unknown'} eventId=${params.sourceEventId ?? 'unknown'}`,
    );
  }

  recipientHash(email: string): string {
    return createHash('sha256')
      .update(this.normalizeEmail(email))
      .digest('hex')
      .slice(0, 16);
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
