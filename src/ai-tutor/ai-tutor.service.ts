import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  EvaluateAiTutorLevelTestDto,
  SendAiTutorMessageDto,
  StartAiTutorVoiceSessionDto,
  TranscribeAiTutorLevelTestDto,
} from "./dto/ai-tutor.dto";
import { AiTutorLearnerProfile } from "./entities/ai-tutor-learner-profile.entity";
import { StoreWalletService } from "../package-store/services/store-wallet.service";
import { AiTutorUsageService } from "./ai-tutor-usage.service";

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
  "A1",
  "A1+",
  "A2",
  "A2+",
  "B1",
  "B1+",
  "B2",
  "B2+",
  "C1",
  "C2",
]);

@Injectable()
export class AiTutorService {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(AiTutorLearnerProfile)
    private readonly profileRepository: Repository<AiTutorLearnerProfile>,
    private readonly walletService: StoreWalletService,
    private readonly usageService: AiTutorUsageService,
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
      const response = await this.requestJsonWithRetry(
        "/v1/voice/sessions",
        {
          userId: user.id,
          displayName: user.fullName ?? "Italian learner",
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
          "AI tutor returned an invalid voice session",
        );
      }

      await this.usageService.activateVoiceSession(
        usageSession.id,
        providerSessionId,
      );
      const balances = await this.walletService.getBalances(user.id);

      return {
        ...(body ?? {}),
        allocatedSeconds: usageSession.allocatedSeconds,
        balances,
      };
    } catch (error) {
      await this.usageService.cancelVoiceSession(usageSession.id);
      throw error;
    }
  }

  async heartbeatVoiceSession(userId: string, sessionId: string) {
    const usage = await this.usageService.heartbeat(userId, sessionId);
    if (usage.shouldEnd) {
      try {
        await this.requestJson("/v1/voice/sessions/end", {
          userId,
          sessionId,
        });
      } catch {
        // Billing state remains authoritative even if the voice worker
        // already stopped or cannot be reached during final cleanup.
      }
    }
    return usage;
  }

  async endVoiceSession(userId: string, sessionId: string) {
    let providerResponse: unknown = {};
    try {
      providerResponse = await this.requestJson("/v1/voice/sessions/end", {
        userId,
        sessionId,
      });
    } finally {
      const balances = await this.usageService.endVoiceSession(
        userId,
        sessionId,
      );
      return {
        ...(this.asRecord(providerResponse) ?? {}),
        balances,
      };
    }
  }

  async sendMessage(
    user: AiTutorAuthenticatedUser,
    dto: SendAiTutorMessageDto,
  ) {
    const balancesBefore = await this.walletService.getBalances(user.id);
    const availableTextTokens = this.readTextTokenBalance(balancesBefore);
    if (availableTextTokens <= 0) {
      throw new BadRequestException(
        "No AI text tokens are available. Purchase an AI bundle first.",
      );
    }

    const learnerProfile = await this.findStoredProfile(user.id);
    const chatMode =
      dto.chatMode === "writing_help" ? "writing_help" : "general";
    const sourceLanguage =
      chatMode === "writing_help"
        ? (dto.sourceLanguage ?? "english")
        : undefined;

    const response = await this.requestJson("/v1/chat", {
      userId: user.id,
      displayName: user.fullName ?? "Italian learner",
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
        "AI tutor did not return billable token usage",
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
    return {
      profile: await this.findStoredProfile(userId),
    };
  }

  async transcribeLevelTestAnswer(
    userId: string,
    dto: TranscribeAiTutorLevelTestDto,
    audio: UploadedAudioFile,
  ) {
    if (audio.size > 12 * 1024 * 1024) {
      throw new BadRequestException("The recorded answer is too large");
    }
    if (
      audio.mimetype &&
      !audio.mimetype.startsWith("audio/") &&
      audio.mimetype !== "application/octet-stream"
    ) {
      throw new BadRequestException(
        "The uploaded file must be an audio recording",
      );
    }

    const formData = new FormData();
    formData.append("userId", userId);
    formData.append("question", dto.question.trim());
    formData.append(
      "audio",
      new Blob([new Uint8Array(audio.buffer)], {
        type: audio.mimetype || "audio/mp4",
      }),
      audio.originalname || "level-test-answer.m4a",
    );

    return this.requestFormData("/v1/level-test/transcribe", formData);
  }

  async evaluateLevelTest(
    user: AiTutorAuthenticatedUser,
    dto: EvaluateAiTutorLevelTestDto,
  ) {
    const response = await this.requestJson("/v1/level-test/evaluate", {
      userId: user.id,
      displayName: user.fullName ?? "Italian learner",
      answers: dto.answers,
    });
    const profile = this.parseProfileResponse(response);
    const storedProfile = await this.saveProfile(user.id, profile);

    return {
      ...(this.asRecord(response) ?? {}),
      profile: storedProfile,
    };
  }

  private resolveGuidedMode(
    level?: "A1" | "A2" | "B1",
    requestedMode?: "guided" | "assisted" | "free",
  ): "guided" | "assisted" | "free" | undefined {
    if (!level) {
      return requestedMode;
    }

    const modeByLevel: Record<
      "A1" | "A2" | "B1",
      "guided" | "assisted" | "free"
    > = {
      A1: "guided",
      A2: "assisted",
      B1: "free",
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
    const existing = await this.profileRepository.findOne({
      where: { userId },
    });
    const entity = existing
      ? this.profileRepository.merge(existing, {
          ...profile,
          completedAt: new Date(profile.completedAt),
          attemptCount: existing.attemptCount + 1,
        })
      : this.profileRepository.create({
          userId,
          ...profile,
          completedAt: new Date(profile.completedAt),
          attemptCount: 1,
        });

    return this.toProfilePayload(await this.profileRepository.save(entity));
  }

  private parseProfileResponse(response: unknown): AiTutorProfilePayload {
    const responseBody = this.asRecord(response);
    const profile = this.asRecord(responseBody?.profile);
    if (!profile) {
      throw new BadGatewayException(
        "AI tutor returned an invalid level profile",
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
    const level = this.readString(value)?.toUpperCase() ?? "A1";
    return AI_TUTOR_LEVELS.has(level) ? level : "A1";
  }

  private readString(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
  }

  private readStringList(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, limit);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === "object"
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
      headers: { "Content-Type": "application/json" },
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
      .get<string>("PIPECAT_SERVICE_URL")
      ?.trim()
      .replace(/\/+$/, "");
    const internalApiKey = this.configService
      .get<string>("PIPECAT_INTERNAL_API_KEY")
      ?.trim();

    if (!baseUrl || !internalApiKey) {
      throw new ServiceUnavailableException(
        "AI tutor service is not configured",
      );
    }

    const timeoutMs = Math.max(
      1000,
      Number(
        this.configService.get<string>("PIPECAT_REQUEST_TIMEOUT_MS") ?? 30000,
      ),
    );
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "X-Internal-Api-Key": internalApiKey,
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
      if (error instanceof Error && error.name === "AbortError") {
        throw new GatewayTimeoutException("AI tutor service timed out");
      }
      throw new ServiceUnavailableException(
        "AI tutor service is currently unavailable",
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
    for (const key of ["detail", "message", "error"]) {
      const value = body[key];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }
    return null;
  }
}
