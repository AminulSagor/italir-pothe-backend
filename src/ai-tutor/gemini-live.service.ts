import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_LIVE_SOCKET =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

@Injectable()
export class GeminiLiveService {
  private readonly logger = new Logger(GeminiLiveService.name);

  constructor(private readonly configService: ConfigService) {}

  get liveModel(): string {
    return (
      this.configService.get<string>('GEMINI_LIVE_MODEL')?.trim() ||
      'gemini-3.1-flash-live-preview'
    ).replace(/^models\//, '');
  }

  get summaryModel(): string {
    return (
      this.configService.get<string>('GEMINI_SESSION_SUMMARY_MODEL')?.trim() ||
      'gemini-2.5-flash'
    ).replace(/^models\//, '');
  }

  async createEphemeralCredential(options: {
    ttlSeconds: number;
    systemInstruction: string;
    resumptionHandle?: string | null;
  }) {
    const now = Date.now();
    const sessionLifetimeSeconds = Math.min(
      19 * 60 * 60,
      Math.max(300, options.ttlSeconds + 300),
    );
    const liveConfig: Record<string, unknown> = {
      responseModalities: ['AUDIO'],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      realtimeInputConfig: {
        automaticActivityDetection: {
          disabled: false,
          prefixPaddingMs: this.numberConfig(
            'GEMINI_VAD_PREFIX_PADDING_MS',
            300,
          ),
          silenceDurationMs: this.numberConfig(
            'GEMINI_VAD_SILENCE_DURATION_MS',
            900,
          ),
        },
        activityHandling: 'START_OF_ACTIVITY_INTERRUPTS',
        turnCoverage: 'TURN_INCLUDES_ONLY_ACTIVITY',
      },
      sessionResumption: options.resumptionHandle
        ? { handle: options.resumptionHandle }
        : {},
      contextWindowCompression: { slidingWindow: {} },
      systemInstruction: {
        parts: [{ text: options.systemInstruction }],
      },
    };

    const response = await this.requestJson(
      `${GEMINI_API_BASE}/auth_tokens`,
      {
        uses: 1,
        expireTime: new Date(now + sessionLifetimeSeconds * 1000).toISOString(),
        newSessionExpireTime: new Date(now + 60_000).toISOString(),
        liveConnectConstraints: {
          model: `models/${this.liveModel}`,
          config: liveConfig,
        },
      },
      'ephemeral_token',
    );
    const token = this.readString(this.asRecord(response)?.name);
    if (!token) {
      throw new BadGatewayException(
        'Gemini returned an invalid ephemeral credential',
      );
    }

    return {
      token,
      socketUrl: GEMINI_LIVE_SOCKET,
      model: this.liveModel,
      expiresAt: new Date(now + sessionLifetimeSeconds * 1000).toISOString(),
      setup: {
        model: `models/${this.liveModel}`,
        generationConfig: {
          responseModalities: ['AUDIO'],
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: liveConfig.realtimeInputConfig,
        sessionResumption: liveConfig.sessionResumption,
        contextWindowCompression: liveConfig.contextWindowCompression,
        systemInstruction: liveConfig.systemInstruction,
      },
    };
  }

  async generateStructuredSummary(
    prompt: string,
  ): Promise<Record<string, unknown>> {
    const response = await this.requestJson(
      `${GEMINI_API_BASE}/models/${encodeURIComponent(this.summaryModel)}:generateContent`,
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
        },
      },
      'session_summary',
    );
    const root = this.asRecord(response);
    const candidates = Array.isArray(root?.candidates) ? root.candidates : [];
    const candidate = this.asRecord(candidates[0]);
    const content = this.asRecord(candidate?.content);
    const parts = Array.isArray(content?.parts) ? content.parts : [];
    const text = this.readString(this.asRecord(parts[0])?.text);
    if (!text) {
      throw new BadGatewayException('Gemini returned an empty session summary');
    }
    try {
      const parsed = JSON.parse(text) as unknown;
      return this.asRecord(parsed) ?? { summary: text };
    } catch {
      return { summary: text };
    }
  }

  private async requestJson(
    url: string,
    body: Record<string, unknown>,
    operation: string,
  ): Promise<unknown> {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY')?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException('Gemini Live is not configured');
    }
    const timeoutMs = this.numberConfig('GEMINI_REQUEST_TIMEOUT_MS', 20_000);
    const abortController = new AbortController();
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      const responseText = await response.text();
      if (!response.ok) {
        const providerError = this.extractProviderError(responseText);
        this.logger.warn(
          JSON.stringify({
            event: 'gemini_request_failed',
            operation,
            status: response.status,
            providerError,
          }),
        );
        throw new BadGatewayException(
          `Gemini request failed with status ${response.status}`,
        );
      }
      return responseText ? (JSON.parse(responseText) as unknown) : {};
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('Gemini request timed out');
      }
      throw new ServiceUnavailableException('Gemini is currently unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  private numberConfig(key: string, fallback: number): number {
    const value = Number(this.configService.get<string>(key) ?? fallback);
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : null;
  }

  private readString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private extractProviderError(responseText: string): string | null {
    try {
      const body = this.asRecord(JSON.parse(responseText) as unknown);
      const error = this.asRecord(body?.error);
      const code = this.readString(error?.status);
      const message = this.readString(error?.message);
      const value = [code, message].filter(Boolean).join(': ');

      return value ? value.slice(0, 500) : null;
    } catch {
      return null;
    }
  }
}
