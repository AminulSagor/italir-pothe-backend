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
      dto.organization ? `Company/project name: ${dto.organization.trim()}` : '',
      skills.length ? `Existing skills: ${skills.join(', ')}` : '',
      highlights.length ? `Existing experience context: ${highlights.join(' | ')}` : '',
      dto.currentText?.trim() ? `Current text: ${dto.currentText.trim()}` : '',
      existingItems.length ? `Already included items: ${existingItems.join(' | ')}` : '',
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
    return (value ?? [])
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private extractSuggestions(response: unknown, maxItems: number): string[] {
    const root = this.asRecord(response);
    if (Array.isArray(root?.suggestions)) {
      return this.cleanSuggestions(root.suggestions, maxItems);
    }

    const message = this.asRecord(root?.message);
    const candidate = [
      root?.reply,
      root?.text,
      root?.response,
      root?.assistantMessage,
      typeof root?.message === 'string' ? root.message : undefined,
      message?.primary,
      message?.text,
      message?.content,
    ].find(
      (value): value is string =>
        typeof value === 'string' && value.trim().length > 0,
    );

    if (!candidate) return [];

    const jsonText = candidate
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    try {
      const parsed = this.asRecord(JSON.parse(jsonText) as unknown);
      if (Array.isArray(parsed?.suggestions)) {
        return this.cleanSuggestions(parsed.suggestions, maxItems);
      }
    } catch {
      // Some model gateways wrap or flatten JSON. Fall back to plain lines.
    }

    return this.cleanSuggestions(
      candidate
        .split(/\n+/)
        .map((line) => line.replace(/^\s*(?:\d+[.)]|[-*])\s*/, '').trim())
        .filter(Boolean),
      maxItems,
    );
  }

  private cleanSuggestions(value: unknown[], maxItems: number): string[] {
    const seen = new Set<string>();
    const result: string[] = [];

    for (const item of value) {
      if (typeof item !== 'string') continue;
      const cleaned = item.replace(/\s+/g, ' ').trim();
      if (cleaned.length < 2 || cleaned.length > 1200) continue;
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
