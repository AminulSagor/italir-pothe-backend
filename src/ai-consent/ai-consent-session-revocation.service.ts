import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, In } from 'typeorm';

import { AiTutorLiveSession } from '../ai-tutor/entities/ai-tutor-live-session.entity';
import { AiTutorLiveSessionStatus } from '../ai-tutor/entities/ai-tutor-live-session.entity';
import {
  AiTutorVoiceUsageSession,
  AiTutorVoiceUsageStatus,
} from '../ai-tutor/entities/ai-tutor-voice-usage-session.entity';
import { StoreWalletService } from '../package-store/services/store-wallet.service';

const FINAL_CHARGE_CAP_SECONDS = 20;

export interface AiConsentSessionRevocationResult {
  invalidatedSessions: number;
  workerTerminationAttempts: number;
  workerTerminationFailures: number;
}

@Injectable()
export class AiConsentSessionRevocationService {
  private readonly logger = new Logger(AiConsentSessionRevocationService.name);

  constructor(
    private readonly walletService: StoreWalletService,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async revokeUserSessions(
    userId: string,
  ): Promise<AiConsentSessionRevocationResult> {
    const invalidation = await this.dataSource.transaction(async (manager) => {
      const usageRepository = manager.getRepository(AiTutorVoiceUsageSession);
      const liveRepository = manager.getRepository(AiTutorLiveSession);
      const sessions = await usageRepository.find({
        where: {
          userId,
          status: In([
            AiTutorVoiceUsageStatus.PENDING,
            AiTutorVoiceUsageStatus.ACTIVE,
          ]),
        },
        lock: { mode: 'pessimistic_write' },
      });
      const now = new Date();

      for (const session of sessions) {
        if (session.status === AiTutorVoiceUsageStatus.ACTIVE) {
          const elapsedSeconds = session.lastHeartbeatAt
            ? Math.max(
                0,
                Math.floor(
                  (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000,
                ),
              )
            : 0;
          const remainingAllocation = Math.max(
            0,
            session.allocatedSeconds - session.usedSeconds,
          );
          const balances = await this.walletService.getBalancesWithManager(
            userId,
            manager,
          );
          const availableSeconds = this.readVoiceSeconds(balances);
          const finalCharge = Math.min(
            elapsedSeconds,
            FINAL_CHARGE_CAP_SECONDS,
            remainingAllocation,
            availableSeconds,
          );
          if (finalCharge > 0) {
            await this.walletService.consumeAiVoiceSeconds(
              userId,
              finalCharge,
              manager,
            );
            session.usedSeconds += finalCharge;
          }
          session.status = AiTutorVoiceUsageStatus.ENDED;
        } else {
          session.status = AiTutorVoiceUsageStatus.CANCELLED;
        }
        session.endedAt = now;
      }
      await usageRepository.save(sessions);

      const usageIds = sessions.map((session) => session.id);
      const liveSessions = usageIds.length
        ? await liveRepository.find({
            where: {
              usageSessionId: In(usageIds),
              status: AiTutorLiveSessionStatus.ACTIVE,
            },
            lock: { mode: 'pessimistic_write' },
          })
        : [];
      const liveUsageIds = new Set(
        liveSessions.map((session) => session.usageSessionId),
      );
      const usedById = new Map(
        sessions.map((session) => [session.id, session.usedSeconds]),
      );
      for (const session of liveSessions) {
        session.activeSeconds = usedById.get(session.usageSessionId) ?? 0;
        session.status = AiTutorLiveSessionStatus.FAILED;
        session.endedAt = now;
        session.summaryLeaseUntil = null;
        session.summaryError = 'AI data-sharing permission was withdrawn.';
        session.pendingTranscript = [];
        session.resumptionHandle = null;
      }
      await liveRepository.save(liveSessions);

      return {
        invalidatedSessions: sessions.length,
        legacySessions: sessions
          .filter(
            (session) =>
              session.providerSessionId && !liveUsageIds.has(session.id),
          )
          .map((session) => session.providerSessionId!),
      };
    });

    const terminationResults = await Promise.all(
      invalidation.legacySessions.map((sessionId) =>
        this.terminatePipecatSession(userId, sessionId),
      ),
    );
    return {
      invalidatedSessions: invalidation.invalidatedSessions,
      workerTerminationAttempts: terminationResults.length,
      workerTerminationFailures: terminationResults.filter((value) => !value)
        .length,
    };
  }

  private async terminatePipecatSession(
    userId: string,
    sessionId: string,
  ): Promise<boolean> {
    const baseUrl = this.configService
      .get<string>('PIPECAT_SERVICE_URL')
      ?.trim()
      .replace(/\/+$/, '');
    const internalApiKey = this.configService
      .get<string>('PIPECAT_INTERNAL_API_KEY')
      ?.trim();
    if (!baseUrl || !internalApiKey) return false;

    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), 10_000);
    try {
      const response = await fetch(`${baseUrl}/v1/voice/sessions/end`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': internalApiKey,
        },
        body: JSON.stringify({ userId, sessionId }),
        signal: abortController.signal,
      });
      return response.ok;
    } catch {
      this.logger.warn(
        'A revoked AI voice worker could not be reached; server authorization remains invalidated.',
      );
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

  private readVoiceSeconds(balances: unknown): number {
    if (!balances || typeof balances !== 'object') return 0;
    const ai = (balances as Record<string, unknown>).ai;
    if (!ai || typeof ai !== 'object') return 0;
    const value = Number((ai as Record<string, unknown>).voiceSeconds ?? 0);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }
}
