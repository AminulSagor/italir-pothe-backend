import {
  BadGatewayException,
  GatewayTimeoutException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ResumeLlmClientService {
  constructor(private readonly configService: ConfigService) {}

  async post(path: string, body: Record<string, unknown>): Promise<unknown> {
    const baseUrl = this.configService
      .get<string>('PIPECAT_SERVICE_URL')
      ?.trim()
      .replace(/\/+$/, '');
    const internalApiKey = this.configService
      .get<string>('PIPECAT_INTERNAL_API_KEY')
      ?.trim();

    if (!baseUrl || !internalApiKey) {
      throw new ServiceUnavailableException(
        'Existing project AI service is not configured',
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
          'Content-Type': 'application/json',
          'X-Internal-Api-Key': internalApiKey,
        },
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      const text = await response.text();
      const parsed = this.parseJsonOrText(text);
      if (!response.ok) {
        throw new BadGatewayException(
          this.extractMessage(parsed) || `AI service returned ${response.status}`,
        );
      }
      return parsed;
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new GatewayTimeoutException('AI service request timed out');
      }
      throw new ServiceUnavailableException(
        'AI service is currently unavailable',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseJsonOrText(text: string): unknown {
    if (!text.trim()) return {};
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return { message: text };
    }
  }

  private extractMessage(value: unknown): string | null {
    const root = this.asRecord(value);
    for (const key of ['detail', 'message', 'error']) {
      const candidate = root?.[key];
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate.trim();
      }
    }
    return null;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
