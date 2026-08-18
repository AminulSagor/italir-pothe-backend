import { BadGatewayException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type {
  ResumeFieldSuggestionDto,
  ResumeSummarySuggestionDto,
} from '../dto/resume-ai.dto';
import { ResumeLlmClientService } from './resume-llm-client.service';

@Injectable()
export class ResumeAiSuggestionService {
  constructor(private readonly llmClient: ResumeLlmClientService) {}

  async suggestSummary(userId: string, dto: ResumeSummarySuggestionDto) {
    return this.suggestField(userId, {
      assistType: 'summary-suggestions',
      currentText: dto.currentSummary,
      targetRole: dto.targetRole,
      experienceHighlights: dto.experienceHighlights,
      skills: dto.skills,
      language: dto.language,
    });
  }

  async suggestField(userId: string, dto: ResumeFieldSuggestionDto) {
    const response = await this.llmClient.post('/v1/chat', {
      userId,
      displayName: 'CV builder user',
      message: this.buildFieldPrompt(dto),
      conversationId: `resume-ai-${randomUUID()}`,
      history: [],
      chatMode: 'general',
      maxBillableTokens: 1400,
    });

    const maxItems = dto.assistType === 'technical-skill-suggestions' ? 10 : 3;
    const suggestions = this.extractSuggestions(response, maxItems);
    if (!suggestions.length) {
      throw new BadGatewayException('AI did not return usable CV suggestions');
    }

    return { suggestions };
  }

  private buildFieldPrompt(dto: ResumeFieldSuggestionDto): string {
    const language = dto.language?.trim() || 'English';
    const skills = this.cleanInputList(dto.skills);
    const highlights = this.cleanInputList(dto.experienceHighlights);
    const existingItems = this.cleanInputList(dto.existingItems);

    const common = [
      'You are an expert CV writing assistant for a general-purpose CV builder.',
      'The builder supports every profession. Give extra practical relevance when the target role is in restaurant/hospitality, industrial/manufacturing, warehouse, transport, or logistics work.',
      `Write all suggestions in ${language}.`,
      'Keep every suggestion factual, ATS-friendly, natural, and easy for the user to edit.',
      'Never invent employers, years, metrics, certifications, machinery, licenses, languages, or achievements that are not supported by the provided context.',
      'Return only valid JSON in this shape: {"suggestions":["..."]}.',
      dto.targetRole ? `Target role: ${dto.targetRole.trim()}` : '',
      dto.itemTitle ? `Current role/project: ${dto.itemTitle.trim()}` : '',
      dto.organization
        ? `Company/project name: ${dto.organization.trim()}`
        : '',
      skills.length ? `Existing skills: ${skills.join(', ')}` : '',
      highlights.length
        ? `Existing experience context: ${highlights.join(' | ')}`
        : '',
      dto.currentText?.trim() ? `Current text: ${dto.currentText.trim()}` : '',
      existingItems.length
        ? `Already included items: ${existingItems.join(' | ')}`
        : '',
    ].filter(Boolean);

    const task = (() => {
      switch (dto.assistType) {
        case 'description-suggestions':
          return [
            'Return exactly 3 concise work/project description options.',
            'Each option should be 1-3 sentences and emphasize responsibilities, workflow, tools, safety, service, quality, or coordination only when supported by context.',
          ];
        case 'highlight-suggestions':
          return [
            'Return exactly 3 strong CV highlight bullet suggestions.',
            'Each suggestion must be one standalone bullet sentence. Do not fabricate numbers or outcomes.',
          ];
        case 'technical-skill-suggestions':
          return [
            'Return 6-10 relevant technical or job-specific skill phrases.',
            'Prefer concrete skills recruiters search for. Avoid soft skills unless they are genuinely job-specific.',
            'Do not repeat skills already included.',
          ];
        case 'summary-suggestions':
        default:
          return [
            'Return exactly 3 professional summary options.',
            'Each option must be concise and 2-4 sentences.',
          ];
      }
    })();

    return [...common, ...task].join('\n');
  }

  private cleanInputList(value?: string[]): string[] {
    return (value ?? []).map((item) => item.trim()).filter(Boolean);
  }

  private extractSuggestions(response: unknown, maxItems: number): string[] {
    const structured = this.findStructuredSuggestions(response, maxItems);
    if (structured.length) return structured;

    const candidate = this.collectTextCandidates(response).find(
      (value) => !this.looksLikeStructuredPayload(value),
    );
    if (!candidate) return [];

    return this.cleanSuggestions(
      candidate
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
        .filter(Boolean),
      maxItems,
    );
  }

  private findStructuredSuggestions(
    value: unknown,
    maxItems: number,
    depth = 0,
  ): string[] {
    if (depth > 6 || value == null) return [];

    if (Array.isArray(value)) {
      if (value.every((item) => typeof item === 'string')) {
        const direct = this.cleanSuggestions(value, maxItems);
        if (direct.length) return direct;
      }
      for (const item of value) {
        const nested = this.findStructuredSuggestions(
          item,
          maxItems,
          depth + 1,
        );
        if (nested.length) return nested;
      }
      return [];
    }

    if (typeof value === 'string') {
      const parsed = this.parseStructuredText(value);
      return parsed === undefined
        ? []
        : this.findStructuredSuggestions(parsed, maxItems, depth + 1);
    }

    const record = this.asRecord(value);
    if (!record) return [];
    if (Array.isArray(record.suggestions)) {
      const direct = this.cleanSuggestions(record.suggestions, maxItems);
      if (direct.length) return direct;
      for (const item of record.suggestions) {
        const nested = this.findStructuredSuggestions(
          item,
          maxItems,
          depth + 1,
        );
        if (nested.length) return nested;
      }
    }

    for (const key of [
      'message',
      'primary',
      'text',
      'content',
      'reply',
      'response',
      'assistantMessage',
      'data',
    ]) {
      const nested = this.findStructuredSuggestions(
        record[key],
        maxItems,
        depth + 1,
      );
      if (nested.length) return nested;
    }
    return [];
  }

  private parseStructuredText(value: string): unknown | undefined {
    const normalized = value
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();
    if (!normalized) return undefined;

    const candidates = [normalized];
    const objectStart = normalized.indexOf('{');
    const objectEnd = normalized.lastIndexOf('}');
    if (objectStart >= 0 && objectEnd > objectStart) {
      const embedded = normalized.slice(objectStart, objectEnd + 1);
      if (embedded !== normalized) candidates.push(embedded);
    }

    for (const candidate of candidates) {
      try {
        return JSON.parse(candidate) as unknown;
      } catch {
        // Try the next possible JSON segment.
      }
    }
    return undefined;
  }

  private collectTextCandidates(value: unknown, depth = 0): string[] {
    if (depth > 5 || value == null) return [];
    if (typeof value === 'string') {
      const normalized = value.trim();
      return normalized ? [normalized] : [];
    }

    const record = this.asRecord(value);
    if (!record) return [];

    const result: string[] = [];
    for (const key of [
      'message',
      'primary',
      'text',
      'content',
      'reply',
      'response',
      'assistantMessage',
      'data',
    ]) {
      result.push(...this.collectTextCandidates(record[key], depth + 1));
    }
    return result;
  }

  private looksLikeStructuredPayload(value: string): boolean {
    const normalized = value.trim();
    return (
      normalized.startsWith('{') ||
      normalized.startsWith('[') ||
      normalized.startsWith('```') ||
      normalized.includes('"suggestions"') ||
      normalized.includes('"primary"')
    );
  }

  private cleanSuggestions(value: unknown[], maxItems: number): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of value) {
      if (typeof item !== 'string') continue;
      const cleaned = item.replace(/\s+/g, ' ').trim();
      if (cleaned.length < 2 || cleaned.length > 1200) continue;
      if (this.looksLikeStructuredPayload(cleaned)) continue;
      const key = cleaned.toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(cleaned);
      if (result.length >= maxItems) break;
    }

    return result;
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  }
}
