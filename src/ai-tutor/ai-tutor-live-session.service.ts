import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { AiTutorLearnerProfile } from './entities/ai-tutor-learner-profile.entity';
import { AiTutorLearningMemory } from './entities/ai-tutor-learning-memory.entity';
import {
  AiTutorLiveSession,
  AiTutorLiveSessionStatus,
  AiTutorTranscriptEvent,
} from './entities/ai-tutor-live-session.entity';
import { AiTutorLiveEventDto } from './dto/ai-tutor.dto';
import { GeminiLiveService } from './gemini-live.service';

const SUMMARY_LEASE_SECONDS = 90;
const MAX_EVENT_IDS = 240;
const MAX_PENDING_TRANSCRIPT_EVENTS = 120;

@Injectable()
export class AiTutorLiveSessionService {
  private readonly logger = new Logger(AiTutorLiveSessionService.name);

  constructor(
    @InjectRepository(AiTutorLiveSession)
    private readonly sessionRepository: Repository<AiTutorLiveSession>,
    @InjectRepository(AiTutorLearningMemory)
    private readonly memoryRepository: Repository<AiTutorLearningMemory>,
    @InjectRepository(AiTutorLearnerProfile)
    private readonly profileRepository: Repository<AiTutorLearnerProfile>,
    private readonly configService: ConfigService,
    private readonly geminiLiveService: GeminiLiveService,
    private readonly dataSource: DataSource,
  ) {}

  async create(options: {
    usageSessionId: string;
    userId: string;
    topic?: string;
    mode?: string;
    guidedLevel?: string;
  }) {
    return this.sessionRepository.save(
      this.sessionRepository.create({
        usageSessionId: options.usageSessionId,
        userId: options.userId,
        model: this.geminiLiveService.liveModel,
        topic: options.topic?.trim() || null,
        mode: options.mode || 'assisted',
        guidedLevel: options.guidedLevel || null,
        status: AiTutorLiveSessionStatus.ACTIVE,
        activeSeconds: 0,
        lastSummarizedActiveSeconds: 0,
        summaryVersion: 0,
        summaryAttemptCount: 0,
        rollingSummary: {},
        pendingTranscript: [],
        processedEventIds: [],
        resumptionHandle: null,
        lastSummaryAt: null,
        summaryLeaseUntil: null,
        finalSummary: null,
        summaryError: null,
        endedAt: null,
      }),
    );
  }

  async getLearningContext(userId: string) {
    const memory = await this.memoryRepository.findOne({ where: { userId } });
    return memory?.memory ?? {};
  }

  async getOwnedActiveSession(userId: string, sessionId: string) {
    const session = await this.sessionRepository.findOne({
      where: {
        usageSessionId: sessionId,
        userId,
        status: AiTutorLiveSessionStatus.ACTIVE,
      },
    });
    if (!session) {
      throw new NotFoundException('Active AI tutor session was not found');
    }
    return session;
  }

  async isGeminiSession(userId: string, sessionId: string): Promise<boolean> {
    return this.sessionRepository.exists({
      where: { usageSessionId: sessionId, userId },
    });
  }

  async recordEvents(
    userId: string,
    sessionId: string,
    events: AiTutorLiveEventDto[],
  ) {
    return this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AiTutorLiveSession);
      const session = await repository.findOne({
        where: { usageSessionId: sessionId, userId },
        lock: { mode: 'pessimistic_write' },
      });
      const acceptsLateFinalEvents =
        session?.status === AiTutorLiveSessionStatus.FINALIZING &&
        session.endedAt != null &&
        Date.now() - session.endedAt.getTime() < 2 * 60 * 1000;
      if (
        !session ||
        (session.status !== AiTutorLiveSessionStatus.ACTIVE &&
          !acceptsLateFinalEvents)
      ) {
        throw new NotFoundException('Active AI tutor session was not found');
      }

      const seen = new Set(session.processedEventIds ?? []);
      const acceptedIds: string[] = [];
      const transcript = [...(session.pendingTranscript ?? [])];
      for (const event of events) {
        const eventId = event.eventId.trim();
        if (!eventId || seen.has(eventId)) continue;
        seen.add(eventId);
        acceptedIds.push(eventId);
        if (event.type === 'resumption_handle') {
          session.resumptionHandle = event.handle?.trim() || null;
          continue;
        }
        const text = event.text?.trim();
        if (!text) continue;
        transcript.push({
          eventId,
          role: event.type === 'user_transcript' ? 'user' : 'assistant',
          text,
          occurredAt: this.validTimestamp(event.occurredAt),
        });
      }
      session.processedEventIds = Array.from(seen).slice(-MAX_EVENT_IDS);
      session.pendingTranscript = transcript.slice(
        -MAX_PENDING_TRANSCRIPT_EVENTS,
      );
      if (acceptsLateFinalEvents) {
        session.summaryLeaseUntil = new Date(Date.now() + 3_000);
      }
      await repository.save(session);
      return { accepted: acceptedIds.length };
    });
  }

  async updateActiveSeconds(sessionId: string, activeSeconds: number) {
    await this.sessionRepository.update(
      { usageSessionId: sessionId, status: AiTutorLiveSessionStatus.ACTIVE },
      { activeSeconds: Math.max(0, Math.floor(activeSeconds)) },
    );
  }

  async markForFinalSummary(userId: string, sessionId: string) {
    await this.sessionRepository.update(
      {
        usageSessionId: sessionId,
        userId,
        status: AiTutorLiveSessionStatus.ACTIVE,
      },
      {
        status: AiTutorLiveSessionStatus.FINALIZING,
        endedAt: new Date(),
        summaryLeaseUntil: new Date(Date.now() + 15_000),
      },
    );
  }

  async markFailed(userId: string, sessionId: string, reason: string) {
    await this.sessionRepository.update(
      { usageSessionId: sessionId, userId },
      {
        status: AiTutorLiveSessionStatus.FAILED,
        endedAt: new Date(),
        summaryError: reason.slice(0, 500),
      },
    );
  }

  @Cron('*/30 * * * * *', { name: 'ai-tutor-live-summary' })
  async processDueSummaries() {
    const sessions = await this.sessionRepository.find({
      where: [
        { status: AiTutorLiveSessionStatus.ACTIVE },
        { status: AiTutorLiveSessionStatus.FINALIZING },
      ],
      order: { updatedAt: 'ASC' },
      take: 10,
    });
    for (const session of sessions) {
      if (!this.isDue(session)) continue;
      try {
        await this.processSummary(session.id);
      } catch (error) {
        await this.recordSummaryFailure(
          session.id,
          error instanceof Error ? error.message : 'Unknown error',
        );
        this.logger.warn(
          JSON.stringify({
            event: 'ai_tutor_summary_failed',
            sessionId: session.id,
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
        );
      }
    }
  }

  private isDue(session: AiTutorLiveSession): boolean {
    if (session.summaryLeaseUntil && session.summaryLeaseUntil > new Date()) {
      return false;
    }
    if (session.status === AiTutorLiveSessionStatus.FINALIZING) return true;
    return (
      session.pendingTranscript.length > 0 &&
      session.activeSeconds - session.lastSummarizedActiveSeconds >=
        this.summaryIntervalSeconds
    );
  }

  private async processSummary(id: string) {
    const claimed = await this.claim(id);
    if (!claimed) return;
    const finalizing = claimed.status === AiTutorLiveSessionStatus.FINALIZING;
    const transcript = [...claimed.pendingTranscript];

    if (transcript.length === 0 && !finalizing) {
      await this.releaseLease(claimed.id);
      return;
    }

    const memory = await this.getLearningContext(claimed.userId);
    const summary = transcript.length
      ? await this.geminiLiveService.generateStructuredSummary(
          this.summaryPrompt(claimed, memory, transcript, finalizing),
        )
      : claimed.rollingSummary;

    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AiTutorLiveSession);
      const current = await repository.findOne({
        where: { id: claimed.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!current) return;
      const summarizedIds = new Set(transcript.map((event) => event.eventId));
      current.pendingTranscript = current.pendingTranscript.filter(
        (event) => !summarizedIds.has(event.eventId),
      );
      current.rollingSummary = summary;
      current.summaryVersion += 1;
      current.summaryAttemptCount = 0;
      current.lastSummaryAt = new Date();
      current.lastSummarizedActiveSeconds = current.activeSeconds;
      current.summaryLeaseUntil = null;
      current.summaryError = null;
      if (finalizing) {
        current.finalSummary = {
          ...summary,
          durationSeconds: current.activeSeconds,
          topic: current.topic,
          mode: current.mode,
        };
        current.status = AiTutorLiveSessionStatus.COMPLETED;
      }
      await repository.save(current);
      if (finalizing) {
        await this.mergeLearningMemory(
          manager.getRepository(AiTutorLearningMemory),
          current,
        );
        await this.updateLearnerProfile(
          manager.getRepository(AiTutorLearnerProfile),
          current,
        );
      }
    });
  }

  private async claim(id: string): Promise<AiTutorLiveSession | null> {
    const now = new Date();
    const result = await this.sessionRepository
      .createQueryBuilder()
      .update(AiTutorLiveSession)
      .set({
        summaryLeaseUntil: new Date(
          now.getTime() + SUMMARY_LEASE_SECONDS * 1000,
        ),
      })
      .where('id = :id', { id })
      .andWhere('("summaryLeaseUntil" IS NULL OR "summaryLeaseUntil" < :now)', {
        now,
      })
      .andWhere('status IN (:...statuses)', {
        statuses: [
          AiTutorLiveSessionStatus.ACTIVE,
          AiTutorLiveSessionStatus.FINALIZING,
        ],
      })
      .execute();
    if (!result.affected) return null;
    return this.sessionRepository.findOne({ where: { id } });
  }

  private async releaseLease(id: string) {
    await this.sessionRepository.update({ id }, { summaryLeaseUntil: null });
  }

  private async recordSummaryFailure(id: string, message: string) {
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(AiTutorLiveSession);
      const session = await repository.findOne({
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!session) return;
      session.summaryAttemptCount += 1;
      session.summaryError = message.slice(0, 500);
      if (
        session.status === AiTutorLiveSessionStatus.FINALIZING &&
        session.summaryAttemptCount >= 3
      ) {
        session.status = AiTutorLiveSessionStatus.FAILED;
        session.summaryLeaseUntil = null;
      } else {
        const retrySeconds = Math.min(
          15 * 60,
          60 * 2 ** Math.max(0, session.summaryAttemptCount - 1),
        );
        session.summaryLeaseUntil = new Date(Date.now() + retrySeconds * 1000);
      }
      await repository.save(session);
    });
  }

  private async mergeLearningMemory(
    repository: Repository<AiTutorLearningMemory>,
    session: AiTutorLiveSession,
  ) {
    const existing = await repository.findOne({
      where: { userId: session.userId },
      lock: { mode: 'pessimistic_write' },
    });
    const nextMemory = {
      ...(existing?.memory ?? {}),
      ...session.rollingSummary,
      lastTopic: session.topic,
      lastMode: session.mode,
      lastPracticedAt: new Date().toISOString(),
    };
    const entity = existing
      ? repository.merge(existing, {
          memory: nextMemory,
          lastSessionId: session.id,
          version: existing.version + 1,
        })
      : repository.create({
          userId: session.userId,
          memory: nextMemory,
          lastSessionId: session.id,
          version: 1,
        });
    await repository.save(entity);
  }

  private async updateLearnerProfile(
    repository: Repository<AiTutorLearnerProfile>,
    session: AiTutorLiveSession,
  ) {
    const profile = await repository.findOne({
      where: { userId: session.userId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!profile) return;
    const summary = session.finalSummary ?? session.rollingSummary;
    profile.speakingLevel = this.level(
      summary.speakingLevel,
      profile.speakingLevel,
    );
    profile.vocabularyLevel = this.level(
      summary.vocabularyLevel,
      profile.vocabularyLevel,
    );
    profile.grammarLevel = this.level(
      summary.grammarLevel,
      profile.grammarLevel,
    );
    profile.finalLevel = this.level(summary.finalLevel, profile.finalLevel);
    profile.summary = this.string(summary.summary) ?? profile.summary;
    profile.strengths = this.stringArray(summary.strengths, profile.strengths);
    profile.focusAreas = this.stringArray(
      summary.weaknesses ?? summary.focusAreas,
      profile.focusAreas,
    );
    await repository.save(profile);
  }

  private summaryPrompt(
    session: AiTutorLiveSession,
    memory: Record<string, unknown>,
    transcript: AiTutorTranscriptEvent[],
    finalizing: boolean,
  ): string {
    return `Return only one compact JSON object for an Italian learning session.
Merge previous memory and the new final transcript events. Never invent learner facts.
Required keys: summary, learnerFacts, learningGoals, recurringMistakes, corrections, vocabularyLearned, strengths, weaknesses, topicProgress, recommendedNextPractice, speakingLevel, vocabularyLevel, grammarLevel, finalLevel, progressIndicators.
CEFR fields must be one of A1,A1+,A2,A2+,B1,B1+,B2,B2+,C1,C2 or null.
This is a ${finalizing ? 'final' : 'rolling'} summary.
Topic: ${session.topic ?? 'general conversation'}
Mode: ${session.mode}
Previous session summary: ${JSON.stringify(session.rollingSummary)}
Persistent learner memory: ${JSON.stringify(memory)}
New transcript: ${JSON.stringify(transcript)}`.slice(0, 55_000);
  }

  private get summaryIntervalSeconds(): number {
    const value = Number(
      this.configService.get<string>(
        'GEMINI_SESSION_SUMMARY_INTERVAL_SECONDS',
      ) ?? 300,
    );
    return Number.isFinite(value) ? Math.max(60, Math.floor(value)) : 300;
  }

  private validTimestamp(value?: string): string {
    const parsed = value ? new Date(value) : new Date();
    return Number.isNaN(parsed.getTime())
      ? new Date().toISOString()
      : parsed.toISOString();
  }

  private level(value: unknown, fallback: string): string {
    const level = this.string(value)?.toUpperCase();
    return level && /^(A1|A1\+|A2|A2\+|B1|B1\+|B2|B2\+|C1|C2)$/.test(level)
      ? level
      : fallback;
  }

  private string(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private stringArray(value: unknown, fallback: string[]): string[] {
    return Array.isArray(value)
      ? value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 8)
      : fallback;
  }
}
