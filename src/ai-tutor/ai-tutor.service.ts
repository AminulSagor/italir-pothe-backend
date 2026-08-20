import {
  BadGatewayException,
  BadRequestException,
  ForbiddenException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import {
  AiTutorLiveEventDto,
  EvaluateAiTutorLevelTestDto,
  SendAiTutorMessageDto,
  StartAiTutorVoiceSessionDto,
  TranscribeAiTutorLevelTestDto,
} from './dto/ai-tutor.dto';
import { AiTutorLearnerProfile } from './entities/ai-tutor-learner-profile.entity';
import { StoreWalletService } from '../package-store/services/store-wallet.service';
import { AiTutorUsageService } from './ai-tutor-usage.service';
import { AiTutorLiveSessionService } from './ai-tutor-live-session.service';
import { GeminiLiveService } from './gemini-live.service';

interface AiTutorAuthenticatedUser {
  id: string;
  fullName?: string;
}

interface UploadedAudioFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

export interface AiTutorProfilePayload {
  speakingLevel: string;
  vocabularyLevel: string;
  grammarLevel: string;
  finalLevel: string;
  summary: string | null;
  strengths: string[];
  focusAreas: string[];
  completedAt: string;
}

const AI_TUTOR_LEVELS = new Set([
  'A1',
  'A1+',
  'A2',
  'A2+',
  'B1',
  'B1+',
  'B2',
  'B2+',
  'C1',
  'C2',
]);

@Injectable()
export class AiTutorService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiTutorLearnerProfile)
    private readonly profileRepository: Repository<AiTutorLearnerProfile>,
    private readonly walletService: StoreWalletService,
    private readonly usageService: AiTutorUsageService,
    private readonly liveSessionService: AiTutorLiveSessionService,
    private readonly geminiLiveService: GeminiLiveService,
    private readonly dataSource: DataSource,
  ) {}

  async startVoiceSession(
    user: AiTutorAuthenticatedUser,
    dto: StartAiTutorVoiceSessionDto,
  ) {
    const requestedTtlSeconds = dto.ttlSeconds ?? 900;
    const usageSession = await this.usageService.beginVoiceSession(
      user.id,
      requestedTtlSeconds,
    );

    try {
      const learnerProfile = await this.findStoredProfile(user.id);
      const guidedMode = this.resolveGuidedMode(
        dto.guidedLevel,
        dto.guidedMode,
      );
      if (dto.voiceTransport !== 'gemini_live') {
        const response = await this.requestJsonWithRetry(
          '/v1/voice/sessions',
          {
            userId: user.id,
            displayName: user.fullName ?? 'Italian learner',
            topic: dto.topic,
            ttlSeconds: usageSession.allocatedSeconds,
            learnerProfile,
            memoryFacts: dto.memoryFacts ?? [],
            recentMistakeTags: dto.recentMistakeTags ?? [],
            guidedMode,
            guidedLevel: dto.guidedLevel,
          },
          2,
        );
        const body = this.asRecord(response);
        const providerSessionId = this.readString(body?.sessionId);
        if (!providerSessionId) {
          throw new BadGatewayException(
            'AI tutor returned an invalid voice session',
          );
        }
        await this.usageService.activateVoiceSession(
          usageSession.id,
          providerSessionId,
        );
        return {
          ...(body ?? {}),
          allocatedSeconds: usageSession.allocatedSeconds,
          balances: await this.walletService.getBalances(user.id),
        };
      }
      const learningMemory = await this.liveSessionService.getLearningContext(
        user.id,
      );
      await this.liveSessionService.create({
        usageSessionId: usageSession.id,
        userId: user.id,
        topic: dto.topic,
        mode: guidedMode,
        guidedLevel: dto.guidedLevel,
      });
      const credential = await this.geminiLiveService.createEphemeralCredential(
        {
          ttlSeconds: usageSession.allocatedSeconds,
          systemInstruction: this.buildLiveSystemInstruction({
            displayName: user.fullName ?? 'Italian learner',
            topic: dto.topic,
            guidedMode,
            guidedLevel: dto.guidedLevel,
            learnerProfile,
            learningMemory,
            memoryFacts: dto.memoryFacts ?? [],
            recentMistakeTags: dto.recentMistakeTags ?? [],
          }),
        },
      );

      await this.usageService.activateVoiceSession(
        usageSession.id,
        usageSession.id,
      );
      const balances = await this.walletService.getBalances(user.id);

      return {
        sessionId: usageSession.id,
        provider: 'gemini_live',
        url: credential.socketUrl,
        socketUrl: credential.socketUrl,
        room: 'gemini-live',
        identity: user.id,
        token: credential.token,
        model: credential.model,
        setup: credential.setup,
        credentialExpiresAt: credential.expiresAt,
        ttlSeconds: usageSession.allocatedSeconds,
        allocatedSeconds: usageSession.allocatedSeconds,
        balances,
      };
    } catch (error) {
      await this.usageService.cancelVoiceSession(usageSession.id);
      await this.liveSessionService.markFailed(
        user.id,
        usageSession.id,
        error instanceof Error
          ? error.message
          : 'Session initialization failed',
      );
      throw error;
    }
  }

  async heartbeatVoiceSession(userId: string, sessionId: string) {
    const usage = await this.usageService.heartbeat(userId, sessionId);
    if (await this.liveSessionService.isGeminiSession(userId, sessionId)) {
      await this.liveSessionService.updateActiveSeconds(
        sessionId,
        usage.usedSeconds,
      );
      if (usage.shouldEnd) {
        await this.liveSessionService.markForFinalSummary(userId, sessionId);
      }
    } else if (usage.shouldEnd) {
      try {
        await this.requestJson('/v1/voice/sessions/end', {
          userId,
          sessionId,
        });
      } catch {
        // Usage/billing remains authoritative if the legacy worker is gone.
      }
    }
    return usage;
  }

  async endVoiceSession(userId: string, sessionId: string) {
    const isGemini = await this.liveSessionService.isGeminiSession(
      userId,
      sessionId,
    );
    if (isGemini) {
      const balances = await this.usageService.endVoiceSession(
        userId,
        sessionId,
      );
      await this.liveSessionService.markForFinalSummary(userId, sessionId);
      return { balances };
    }
    let providerResponse: unknown = {};
    try {
      providerResponse = await this.requestJson('/v1/voice/sessions/end', {
        userId,
        sessionId,
      });
    } finally {
      const balances = await this.usageService.endVoiceSession(
        userId,
        sessionId,
      );
      return { ...(this.asRecord(providerResponse) ?? {}), balances };
    }
  }

  async reconnectVoiceSession(
    user: AiTutorAuthenticatedUser,
    sessionId: string,
    resumptionHandle?: string,
  ) {
    const session = await this.liveSessionService.getOwnedActiveSession(
      user.id,
      sessionId,
    );
    const learnerProfile = await this.findStoredProfile(user.id);
    const learningMemory = await this.liveSessionService.getLearningContext(
      user.id,
    );
    const credential = await this.geminiLiveService.createEphemeralCredential({
      ttlSeconds: 3600,
      resumptionHandle: resumptionHandle || session.resumptionHandle,
      systemInstruction: this.buildLiveSystemInstruction({
        displayName: user.fullName ?? 'Italian learner',
        topic: session.topic ?? undefined,
        guidedMode: session.mode as 'guided' | 'assisted' | 'free',
        guidedLevel: session.guidedLevel as 'A1' | 'A2' | 'B1' | undefined,
        learnerProfile,
        learningMemory: {
          ...learningMemory,
          currentSessionSummary: session.rollingSummary,
        },
        memoryFacts: [],
        recentMistakeTags: [],
      }),
    });
    return {
      sessionId,
      provider: 'gemini_live',
      url: credential.socketUrl,
      socketUrl: credential.socketUrl,
      room: 'gemini-live',
      identity: user.id,
      token: credential.token,
      model: credential.model,
      setup: credential.setup,
      credentialExpiresAt: credential.expiresAt,
    };
  }

  async recordLiveEvents(
    userId: string,
    sessionId: string,
    events: AiTutorLiveEventDto[],
  ) {
    return this.liveSessionService.recordEvents(userId, sessionId, events);
  }

  async sendMessage(
    user: AiTutorAuthenticatedUser,
    dto: SendAiTutorMessageDto,
  ) {
    const balancesBefore = await this.walletService.getBalances(user.id);
    const availableTextTokens = this.readTextTokenBalance(balancesBefore);
    if (availableTextTokens <= 0) {
      throw new BadRequestException(
        'No AI text tokens are available. Purchase an AI bundle first.',
      );
    }

    const learnerProfile = await this.findStoredProfile(user.id);
    const chatMode =
      dto.chatMode === 'writing_help' ? 'writing_help' : 'general';
    const sourceLanguage =
      chatMode === 'writing_help'
        ? (dto.sourceLanguage ?? 'english')
        : undefined;

    const response = await this.requestJson('/v1/chat', {
      userId: user.id,
      displayName: user.fullName ?? 'Italian learner',
      message: dto.message.trim(),
      conversationId: dto.conversationId,
      history: dto.history ?? [],
      learnerProfile,
      memoryFacts: dto.memoryFacts ?? [],
      recentMistakeTags: dto.recentMistakeTags ?? [],
      chatMode,
      sourceLanguage,
      maxBillableTokens: availableTextTokens,
    });
    const responseBody = this.asRecord(response);
    const usage = this.asRecord(responseBody?.usage);
    const totalTokens = Math.max(
      0,
      Math.floor(Number(usage?.totalTokens ?? 0)),
    );

    if (!Number.isFinite(totalTokens) || totalTokens <= 0) {
      throw new BadGatewayException(
        'AI tutor did not return billable token usage',
      );
    }

    const balances = await this.walletService.consumeAiTextTokens(
      user.id,
      totalTokens,
    );

    return {
      ...(responseBody ?? {}),
      usage,
      balances,
    };
  }

  async getLevelTestProfile(userId: string) {
    const profileEntity = await this.profileRepository.findOne({
      where: { userId },
    });
    const maxAttempts = this.levelTestMaxAttempts;
    const attemptsUsed = profileEntity?.attemptCount ?? 0;
    return {
      profile: profileEntity ? this.toProfilePayload(profileEntity) : null,
      attemptsUsed,
      maxAttempts,
      attemptsRemaining: Math.max(0, maxAttempts - attemptsUsed),
      canAttempt: attemptsUsed < maxAttempts,
    };
  }

  async startLevelTestVoiceSession(user: AiTutorAuthenticatedUser) {
    await this.assertLevelTestAttemptAvailable(user.id);
    const ttlSeconds = 600;
    const credential = await this.geminiLiveService.createEphemeralCredential({
      ttlSeconds,
      systemInstruction: this.buildLevelTestSystemInstruction(
        user.fullName ?? 'Italian learner',
      ),
    });

    return {
      sessionId: `level-test-${randomUUID()}`,
      provider: 'gemini_live',
      sessionPurpose: 'level_test',
      isFree: true,
      url: credential.socketUrl,
      socketUrl: credential.socketUrl,
      room: 'gemini-live-level-test',
      identity: user.id,
      token: credential.token,
      model: credential.model,
      setup: credential.setup,
      credentialExpiresAt: credential.expiresAt,
      ttlSeconds,
      allocatedSeconds: ttlSeconds,
    };
  }

  async transcribeLevelTestAnswer(
    userId: string,
    dto: TranscribeAiTutorLevelTestDto,
    audio: UploadedAudioFile,
  ) {
    if (audio.size > 12 * 1024 * 1024) {
      throw new BadRequestException('The recorded answer is too large');
    }
    if (
      audio.mimetype &&
      !audio.mimetype.startsWith('audio/') &&
      audio.mimetype !== 'application/octet-stream'
    ) {
      throw new BadRequestException(
        'The uploaded file must be an audio recording',
      );
    }

    const formData = new FormData();
    formData.append('userId', userId);
    formData.append('question', dto.question.trim());
    formData.append(
      'audio',
      new Blob([new Uint8Array(audio.buffer)], {
        type: audio.mimetype || 'audio/mp4',
      }),
      audio.originalname || 'level-test-answer.m4a',
    );

    return this.requestFormData('/v1/level-test/transcribe', formData);
  }

  async evaluateLevelTest(
    user: AiTutorAuthenticatedUser,
    dto: EvaluateAiTutorLevelTestDto,
  ) {
    await this.assertLevelTestAttemptAvailable(user.id);
    const skillCounts = dto.answers.reduce<Record<string, number>>(
      (counts, answer) => ({
        ...counts,
        [answer.skill]: (counts[answer.skill] ?? 0) + 1,
      }),
      {},
    );
    if (
      skillCounts.speaking !== 1 ||
      skillCounts.vocabulary !== 2 ||
      skillCounts.grammar !== 3
    ) {
      throw new BadRequestException(
        'The level test requires one speaking assessment and five configured multiple-choice answers.',
      );
    }
    const response = await this.requestJson('/v1/level-test/evaluate', {
      userId: user.id,
      displayName: user.fullName ?? 'Italian learner',
      answers: dto.answers,
    });
    const profile = this.parseProfileResponse(response);
    const storedProfile = await this.saveProfile(user.id, profile);

    return {
      ...(this.asRecord(response) ?? {}),
      profile: storedProfile,
    };
  }

  private buildLevelTestSystemInstruction(displayName: string): string {
    return `You are conducting Italir Pothe's free spoken Italian CEFR level assessment for ${displayName}.
Start immediately with a short welcome, then ask one spoken question at a time in Italian. Begin easy and adapt from A1 toward C2 based only on the learner's replies. Ask 4 to 6 concise questions covering introduction, daily life, practical situations, vocabulary range, grammar and fluency.
This is an assessment: do not teach, correct, reveal answers, or ask the learner to type or write. Do not ask multiple questions in one turn. Briefly acknowledge an answer and continue. If the learner cannot understand, simplify once in Italian; a short Bangla or English clarification is allowed only when requested.
After enough evidence, say that the speaking section is complete and ask the learner to tap the red finish button to continue to the multiple-choice section. Keep every spoken response concise.`;
  }

  private get levelTestMaxAttempts(): number {
    const configured = Number(
      this.configService.get<string>('AI_TUTOR_LEVEL_TEST_MAX_ATTEMPTS') ?? 3,
    );
    return Number.isInteger(configured) && configured > 0
      ? Math.min(configured, 100)
      : 3;
  }

  private async assertLevelTestAttemptAvailable(userId: string) {
    const profile = await this.profileRepository.findOne({ where: { userId } });
    if ((profile?.attemptCount ?? 0) >= this.levelTestMaxAttempts) {
      throw new ForbiddenException(
        'The maximum number of free level-test attempts has been reached.',
      );
    }
  }

  private buildLiveSystemInstruction(options: {
    displayName: string;
    topic?: string;
    guidedMode?: 'guided' | 'assisted' | 'free';
    guidedLevel?: 'A1' | 'A2' | 'B1';
    learnerProfile: AiTutorProfilePayload | null;
    learningMemory: Record<string, unknown>;
    memoryFacts: string[];
    recentMistakeTags: string[];
  }): string {
    const level =
      options.learnerProfile?.finalLevel ?? options.guidedLevel ?? 'A1';
    const mode = options.guidedMode ?? 'assisted';
    return `You are Italir Pothe's realtime Italian speaking tutor for ${options.displayName}.
Conduct a natural AUDIO conversation primarily in Italian about: ${options.topic ?? 'everyday Italian'}.
Follow the learner's spoken language request. If they ask you to speak or explain in Bengali/Bangla or English, switch immediately to that language and continue using it until they ask to switch again. Bengali and English may be used for explanations while still teaching and practising Italian. Speak each requested language naturally and never refuse a language switch merely because this is an Italian lesson.
Learning mode: ${mode}. Current CEFR: ${level}.
Adaptation: A1/A2 means slower, short sentences and simple vocabulary; B1/B2 means moderate natural complexity; C1/C2 means natural speed and richer vocabulary.
Guided mode: give structure, prompts and examples. Assisted mode: converse and help when needed. Free mode: converse naturally.
Correct only meaningful errors. When correcting, briefly provide corrected Italian, a short explanation, and one simpler example when useful. Do not interrupt every minor mistake and do not turn the conversation into a lecture.
Assess speaking, vocabulary and grammar through conversation. Encourage the learner to speak. Never require typed or written answers.
If the learner starts speaking, stop your current response and listen. Keep spoken replies concise.
Known learner profile: ${JSON.stringify(options.learnerProfile ?? {})}
Persistent learning memory: ${JSON.stringify(options.learningMemory)}
Current client memory: ${JSON.stringify(options.memoryFacts.slice(0, 12))}
Recent mistake tags: ${JSON.stringify(options.recentMistakeTags.slice(0, 12))}`.slice(
      0,
      20_000,
    );
  }

  private resolveGuidedMode(
    level?: 'A1' | 'A2' | 'B1',
    requestedMode?: 'guided' | 'assisted' | 'free',
  ): 'guided' | 'assisted' | 'free' | undefined {
    if (!level) {
      return requestedMode;
    }

    const modeByLevel: Record<
      'A1' | 'A2' | 'B1',
      'guided' | 'assisted' | 'free'
    > = {
      A1: 'guided',
      A2: 'assisted',
      B1: 'free',
    };
    const expectedMode = modeByLevel[level];
    if (requestedMode && requestedMode !== expectedMode) {
      throw new BadRequestException(
        `Guided level ${level} must use ${expectedMode} mode`,
      );
    }
    return expectedMode;
  }

  private async findStoredProfile(
    userId: string,
  ): Promise<AiTutorProfilePayload | null> {
    const entity = await this.profileRepository.findOne({ where: { userId } });
    return entity ? this.toProfilePayload(entity) : null;
  }

  private async saveProfile(
    userId: string,
    profile: AiTutorProfilePayload,
  ): Promise<AiTutorProfilePayload> {
    const saved = await this.dataSource.transaction(async (manager) => {
      await manager.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`ai-tutor-level-test:${userId}`],
      );
      const repository = manager.getRepository(AiTutorLearnerProfile);
      const existing = await repository.findOne({
        where: { userId },
        lock: { mode: 'pessimistic_write' },
      });
      if ((existing?.attemptCount ?? 0) >= this.levelTestMaxAttempts) {
        throw new ForbiddenException(
          'The maximum number of free level-test attempts has been reached.',
        );
      }
      const entity = existing
        ? repository.merge(existing, {
            ...profile,
            completedAt: new Date(profile.completedAt),
            attemptCount: existing.attemptCount + 1,
          })
        : repository.create({
            userId,
            ...profile,
            completedAt: new Date(profile.completedAt),
            attemptCount: 1,
          });
      return repository.save(entity);
    });

    return this.toProfilePayload(saved);
  }

  private parseProfileResponse(response: unknown): AiTutorProfilePayload {
    const responseBody = this.asRecord(response);
    const profile = this.asRecord(responseBody?.profile);
    if (!profile) {
      throw new BadGatewayException(
        'AI tutor returned an invalid level profile',
      );
    }

    const completedAtValue = this.readString(profile.completedAt);
    const completedAt = completedAtValue
      ? new Date(completedAtValue)
      : new Date();

    return {
      speakingLevel: this.readLevel(profile.speakingLevel),
      vocabularyLevel: this.readLevel(profile.vocabularyLevel),
      grammarLevel: this.readLevel(profile.grammarLevel),
      finalLevel: this.readLevel(profile.finalLevel),
      summary: this.readString(profile.summary),
      strengths: this.readStringList(profile.strengths, 6),
      focusAreas: this.readStringList(profile.focusAreas, 6),
      completedAt: Number.isNaN(completedAt.getTime())
        ? new Date().toISOString()
        : completedAt.toISOString(),
    };
  }

  private toProfilePayload(
    entity: AiTutorLearnerProfile,
  ): AiTutorProfilePayload {
    return {
      speakingLevel: this.readLevel(entity.speakingLevel),
      vocabularyLevel: this.readLevel(entity.vocabularyLevel),
      grammarLevel: this.readLevel(entity.grammarLevel),
      finalLevel: this.readLevel(entity.finalLevel),
      summary: entity.summary,
      strengths: entity.strengths ?? [],
      focusAreas: entity.focusAreas ?? [],
      completedAt: entity.completedAt.toISOString(),
    };
  }

  private readTextTokenBalance(balances: unknown): number {
    const root = this.asRecord(balances);
    const ai = this.asRecord(root?.ai);
    const value = Number(ai?.textTokens ?? 0);
    return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  }

  private readLevel(value: unknown): string {
    const level = this.readString(value)?.toUpperCase() ?? 'A1';
    return AI_TUTOR_LEVELS.has(level) ? level : 'A1';
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private readStringList(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private async requestJsonWithRetry(
    path: string,
    body: Record<string, unknown>,
    maxAttempts: number,
  ): Promise<unknown> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= Math.max(1, maxAttempts); attempt++) {
      try {
        return await this.requestJson(path, body);
      } catch (error) {
        lastError = error;
        const retryable =
          error instanceof BadGatewayException ||
          error instanceof GatewayTimeoutException ||
          error instanceof ServiceUnavailableException;
        if (!retryable || attempt >= maxAttempts) {
          throw error;
        }
        await new Promise<void>((resolve) =>
          setTimeout(resolve, attempt * 450),
        );
      }
    }

    throw lastError;
  }

  private requestJson(
    path: string,
    body: Record<string, unknown>,
  ): Promise<unknown> {
    return this.performRequest(path, {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  private requestFormData(path: string, body: FormData): Promise<unknown> {
    return this.performRequest(path, { body });
  }

  private async performRequest(
    path: string,
    options: {
      headers?: Record<string, string>;
      body?: string | FormData;
    },
  ): Promise<unknown> {
    const baseUrl = this.configService
      .get<string>('PIPECAT_SERVICE_URL')
      ?.trim()
      .replace(/\/+$/, '');
    const internalApiKey = this.configService
      .get<string>('PIPECAT_INTERNAL_API_KEY')
      ?.trim();

    if (!baseUrl || !internalApiKey) {
      throw new ServiceUnavailableException(
        'AI tutor service is not configured',
      );
    }

    const timeoutMs = Math.max(
      1000,
      Number(
        this.configService.get<string>('PIPECAT_REQUEST_TIMEOUT_MS') ?? 30000,
      ),
    );
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'X-Internal-Api-Key': internalApiKey,
          ...options.headers,
        },
        body: options.body,
        signal: abortController.signal,
      });

      const responseText = await response.text();
      const responseBody = this.parseResponseBody(responseText);
      if (!response.ok) {
        const message = this.extractErrorMessage(responseBody);
        throw new BadGatewayException(
          message || `AI tutor service returned ${response.status}`,
        );
      }

      return responseBody;
    } catch (error) {
      if (
        error instanceof BadGatewayException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('AI tutor service timed out');
      }
      throw new ServiceUnavailableException(
        'AI tutor service is currently unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseResponseBody(responseText: string): unknown {
    if (!responseText.trim()) {
      return {};
    }
    try {
      return JSON.parse(responseText) as unknown;
    } catch {
      return { message: responseText };
    }
  }

  private extractErrorMessage(responseBody: unknown): string | null {
    const body = this.asRecord(responseBody);
    if (!body) {
      return null;
    }
    for (const key of ['detail', 'message', 'error']) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }
}
