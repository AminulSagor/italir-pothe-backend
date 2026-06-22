import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  SendAiTutorMessageDto,
  StartAiTutorVoiceSessionDto,
} from './dto/ai-tutor.dto';

interface AiTutorAuthenticatedUser {
  id: string;
  fullName?: string;
}

@Injectable()
export class AiTutorService {
  constructor(private readonly configService: ConfigService) {}

  async startVoiceSession(
    user: AiTutorAuthenticatedUser,
    dto: StartAiTutorVoiceSessionDto,
  ) {
    return this.request('/v1/voice/sessions', {
      method: 'POST',
      body: {
        userId: user.id,
        displayName: user.fullName ?? 'Italian learner',
        topic: dto.topic,
        ttlSeconds: dto.ttlSeconds,
      },
    });
  }

  async endVoiceSession(userId: string, sessionId: string) {
    return this.request('/v1/voice/sessions/end', {
      method: 'POST',
      body: {
        userId,
        sessionId,
      },
    });
  }

  async sendMessage(user: AiTutorAuthenticatedUser, dto: SendAiTutorMessageDto) {
    return this.request('/v1/chat', {
      method: 'POST',
      body: {
        userId: user.id,
        displayName: user.fullName ?? 'Italian learner',
        message: dto.message.trim(),
        conversationId: dto.conversationId,
        history: dto.history ?? [],
      },
    });
  }

  private async request(
    path: string,
    options: {
      method: 'GET' | 'POST';
      body?: Record<string, unknown>;
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
        method: options.method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': internalApiKey,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
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
      if (error instanceof BadGatewayException) {
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
    if (!responseBody || typeof responseBody !== 'object') {
      return null;
    }

    const body = responseBody as Record<string, unknown>;
    for (const key of ['detail', 'message', 'error']) {
      const value = body[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }

    return null;
  }
}
