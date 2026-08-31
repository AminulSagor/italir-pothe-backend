import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageKeywordScannerService } from './message-keyword-scanner.service';
import { MessageModerationLlmService } from './message-moderation-llm.service';
import { MessageModerationDecision } from './message-moderation.types';

@Injectable()
export class MessageModerationService {
  private readonly logger = new Logger(MessageModerationService.name);
  private readonly enabled: boolean;
  private readonly enforcementConfidence: number;

  constructor(
    private readonly scanner: MessageKeywordScannerService,
    private readonly llm: MessageModerationLlmService,
    private readonly configService: ConfigService,
  ) {
    // Default off so an older mobile client cannot be affected merely by
    // deploying this backend. Enable only after the client handles moderation
    // acknowledgements.
    this.enabled = this.booleanConfig('CHAT_MODERATION_ENABLED', false);
    this.enforcementConfidence = this.numberConfig(
      'CHAT_MODERATION_HIGH_CONFIDENCE',
      0.9,
      0.5,
      1,
    );
  }

  async moderate(
    content: string | null | undefined,
  ): Promise<MessageModerationDecision> {
    if (!this.enabled || !content?.trim()) return this.safe('local');

    const scan = this.scanner.scan(content);
    if (!scan.suspicious) return this.safe('local');

    try {
      const result = await this.llm.classify({
        content,
        categories: scan.categories,
        matchedTerms: scan.matchedTerms,
      });

      if (result.confidence < this.enforcementConfidence) {
        return this.safe('llm');
      }

      return { ...result, source: 'llm' };
    } catch (error) {
      const description =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      this.logger.warn(
        `Message moderation LLM failed open after a suspicious local scan: ${description}`,
      );
      return this.safe('fail_open');
    }
  }

  private safe(
    source: MessageModerationDecision['source'],
  ): MessageModerationDecision {
    return {
      action: 'safe',
      confidence: 1,
      categories: [],
      reason: '',
      source,
    };
  }

  private booleanConfig(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();
    if (!value) return fallback;
    if (['true', '1', 'yes', 'on'].includes(value)) return true;
    if (['false', '0', 'no', 'off'].includes(value)) return false;
    return fallback;
  }

  private numberConfig(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const parsed = Number(this.configService.get<string>(key));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, parsed));
  }
}
