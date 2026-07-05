import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { PaymentRequiredException } from '../common/exceptions/payment-required.exception';
import { StoreWalletService } from '../package-store/services/store-wallet.service';
import {
  AiTutorVoiceUsageSession,
  AiTutorVoiceUsageStatus,
} from './entities/ai-tutor-voice-usage-session.entity';

const HEARTBEAT_MAX_CHARGE_SECONDS = 20;
const STALE_HEARTBEAT_SECONDS = 45;
const STALE_PENDING_SECONDS = 120;

@Injectable()
export class AiTutorUsageService {
  constructor(
    @InjectRepository(AiTutorVoiceUsageSession)
    private readonly voiceSessionRepository: Repository<AiTutorVoiceUsageSession>,
    private readonly walletService: StoreWalletService,
    private readonly dataSource: DataSource,
  ) {}

  async beginVoiceSession(userId: string, requestedTtlSeconds: number) {
    await this.expireStaleSessions(userId);

    const balances = await this.walletService.getBalances(userId);
    const availableSeconds = this.readVoiceSeconds(balances);
    if (availableSeconds <= 0) {
      throw new PaymentRequiredException(
        'No AI voice time is available. Purchase an AI bundle first.',
      );
    }

    const allocatedSeconds = Math.max(
      1,
      Math.min(requestedTtlSeconds, availableSeconds),
    );

    try {
      return await this.voiceSessionRepository.save(
        this.voiceSessionRepository.create({
          userId,
          providerSessionId: null,
          status: AiTutorVoiceUsageStatus.PENDING,
          allocatedSeconds,
          usedSeconds: 0,
          connectedAt: null,
          lastHeartbeatAt: null,
          endedAt: null,
        }),
      );
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'Another AI voice session is still active. End it before starting a new one.',
        );
      }
      throw error;
    }
  }

  async activateVoiceSession(id: string, providerSessionId: string) {
    const session = await this.voiceSessionRepository.findOne({ where: { id } });
    if (!session) {
      throw new NotFoundException('AI voice usage session was not found.');
    }

    session.providerSessionId = providerSessionId;
    session.status = AiTutorVoiceUsageStatus.ACTIVE;
    return this.voiceSessionRepository.save(session);
  }

  async cancelVoiceSession(id: string) {
    await this.voiceSessionRepository.update(
      { id },
      {
        status: AiTutorVoiceUsageStatus.CANCELLED,
        endedAt: new Date(),
      },
    );
  }

  async heartbeat(userId: string, providerSessionId: string) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AiTutorVoiceUsageSession);
      const session = await repository.findOne({
        where: {
          userId,
          providerSessionId,
          status: AiTutorVoiceUsageStatus.ACTIVE,
        },
        lock: { mode: 'pessimistic_write' },
      });

      if (!session) {
        const balances = await this.walletService.getBalances(userId);
        return {
          active: false,
          shouldEnd: true,
          usedSeconds: 0,
          sessionRemainingSeconds: 0,
          balances,
        };
      }

      const now = new Date();
      let chargedSeconds = 0;
      let balances: unknown = null;

      if (!session.lastHeartbeatAt) {
        session.connectedAt = now;
        session.lastHeartbeatAt = now;
      } else {
        const elapsedSeconds = Math.max(
          0,
          Math.floor(
            (now.getTime() - session.lastHeartbeatAt.getTime()) / 1000,
          ),
        );
        const sessionRemaining = Math.max(
          0,
          session.allocatedSeconds - session.usedSeconds,
        );
        chargedSeconds = Math.min(
          elapsedSeconds,
          HEARTBEAT_MAX_CHARGE_SECONDS,
          sessionRemaining,
        );

        if (chargedSeconds > 0) {
          balances = await this.walletService.consumeAiVoiceSeconds(
            userId,
            chargedSeconds,
            manager,
          );
          session.usedSeconds += chargedSeconds;
        }
        session.lastHeartbeatAt = now;
      }

      const sessionRemainingSeconds = Math.max(
        0,
        session.allocatedSeconds - session.usedSeconds,
      );
      const shouldEnd = sessionRemainingSeconds <= 0;
      if (shouldEnd) {
        session.status = AiTutorVoiceUsageStatus.ENDED;
        session.endedAt = now;
      }

      await repository.save(session);
      balances ??= await this.walletService.getBalances(userId);

      return {
        active: !shouldEnd,
        shouldEnd,
        chargedSeconds,
        usedSeconds: session.usedSeconds,
        sessionRemainingSeconds,
        balances,
      };
    });
  }

  async endVoiceSession(userId: string, providerSessionId: string) {
    const session = await this.voiceSessionRepository.findOne({
      where: { userId, providerSessionId },
    });

    if (session && session.status !== AiTutorVoiceUsageStatus.ENDED) {
      session.status = AiTutorVoiceUsageStatus.ENDED;
      session.endedAt = new Date();
      await this.voiceSessionRepository.save(session);
    }

    return this.walletService.getBalances(userId);
  }

  async expireStaleSessions(userId?: string) {
    const now = Date.now();
    const heartbeatCutoff = new Date(now - STALE_HEARTBEAT_SECONDS * 1000);
    const pendingCutoff = new Date(now - STALE_PENDING_SECONDS * 1000);
    const endedAt = new Date();

    const activeQuery = this.voiceSessionRepository
      .createQueryBuilder()
      .update(AiTutorVoiceUsageSession)
      .set({
        status: AiTutorVoiceUsageStatus.ENDED,
        endedAt,
      })
      .where('status = :status', { status: AiTutorVoiceUsageStatus.ACTIVE })
      .andWhere(
        '("lastHeartbeatAt" < :heartbeatCutoff OR '
          + '("lastHeartbeatAt" IS NULL AND "createdAt" < :pendingCutoff))',
        { heartbeatCutoff, pendingCutoff },
      );
    if (userId) {
      activeQuery.andWhere('"userId" = :userId', { userId });
    }
    await activeQuery.execute();

    const pendingQuery = this.voiceSessionRepository
      .createQueryBuilder()
      .update(AiTutorVoiceUsageSession)
      .set({
        status: AiTutorVoiceUsageStatus.CANCELLED,
        endedAt,
      })
      .where('status = :status', { status: AiTutorVoiceUsageStatus.PENDING })
      .andWhere('"createdAt" < :pendingCutoff', { pendingCutoff });
    if (userId) {
      pendingQuery.andWhere('"userId" = :userId', { userId });
    }
    await pendingQuery.execute();
  }

  private readVoiceSeconds(balances: unknown): number {
    const root = this.asRecord(balances);
    const ai = this.asRecord(root?.ai);
    const seconds = Number(ai?.voiceSeconds ?? 0);
    return Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    const record = this.asRecord(error);
    const driverError = this.asRecord(record?.driverError);
    return record?.code === '23505' || driverError?.code === '23505';
  }
}
