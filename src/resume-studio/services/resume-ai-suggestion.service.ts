import { BadGatewayException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { ResumeSummarySuggestionDto } from '../dto/resume-ai.dto';
import { ResumeLlmClientService } from './resume-llm-client.service';

@Injectable()
export class ResumeAiSuggestionService {
  constructor(private readonly llmClient: ResumeLlmClientService) {}

  async suggestSummary(userId: string, dto: ResumeSummarySuggestionDto) {
    const response = await this.llmClient.post('/v1/chat', {
      userId,
      displayName: 'CV builder user',
      message: this.buildPrompt(dto),
      conversationId: `resume-summary-${randomUUID()}`,
      history: [],
      chatMode: 'general',
      maxBillableTokens: 1200,
    });

    const suggestions = this.extractSuggestions(response);
    if (!suggestions.length) {
      throw new BadGatewayException(
        'AI did not return usable CV summary suggestions',
      );
    }
    return { suggestions: suggestions.slice(0, 3) };
  }

  private buildPrompt(dto: ResumeSummarySuggestionDto): string {
    const tone = dto.tone ?? 'professional';
    const language = dto.language?.trim() || 'English';
    const highlights = (dto.experienceHighlights ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
    const skills = (dto.skills ?? [])
      .map((item) => item.trim())
      .filter(Boolean);

    return [
      'You are helping write a professional CV summary.',
      `Return exactly 3 ${tone} summary options in ${language}.`,
      'Each option must be concise, factual, ATS-friendly, and 2-4 sentences.',
      'Do not invent employers, years, metrics, degrees, certifications, or achievements.',
      'Return only valid JSON in this exact shape: {"suggestions":["...","...","..."]}.',
      dto.targetRole ? `Target role: ${dto.targetRole.trim()}` : '',
      dto.currentSummary ? `Current summary: ${dto.currentSummary.trim()}` : '',
      highlights.length ? `Experience highlights: ${highlights.join(' | ')}` : '',
      skills.length ? `Skills: ${skills.join(', ')}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private extractSuggestions(response: unknown): string[] {
    const root = this.asRecord(response);
    if (Array.isArray(root?.suggestions)) {
      return this.cleanSuggestions(root.suggestions);
    }

    const candidate = ['reply', 'message', 'text', 'response', 'assistantMessage']
      .map((key) => root?.[key])
      .find((value) => typeof value === 'string') as string | undefined;
    if (!candidate) return [];

    const jsonText = candidate
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    try {
      const parsed = this.asRecord(JSON.parse(jsonText) as unknown);
      if (Array.isArray(parsed?.suggestions)) {
        return this.cleanSuggestions(parsed.suggestions);
      }
    } catch {
      // Fall back to numbered/plain lines when the existing AI worker wraps JSON.
    }

    return this.cleanSuggestions(
      candidate
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
        .filter(Boolean),
    );
  }

  private cleanSuggestions(value: unknown[]): string[] {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.replace(/\s+/g, ' ').trim())
      .filter((item) => item.length >= 40 && item.length <= 1200)
      .slice(0, 3);
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
