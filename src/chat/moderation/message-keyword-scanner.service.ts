import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  KeywordScanResult,
  ModerationCategory,
  MODERATION_CATEGORIES,
} from './message-moderation.types';

const DEFAULT_KEYWORDS: Record<ModerationCategory, string[]> = {
  profanity: [
    'fuck',
    'shit',
    'bitch',
    'asshole',
    'cazzo',
    'merda',
    'vaffanculo',
    'শালা',
    'হারামি',
  ],
  sexual: [
    'nude',
    'nudes',
    'naked',
    'porn',
    'porno',
    'sext',
    'dick',
    'pussy',
    'xxx',
  ],
  hate: ['nazi', 'subhuman', 'kill all', 'gas them', 'razza inferiore'],
  threat: [
    'kill you',
    'murder you',
    'hurt you',
    'rape you',
    'find you and',
    'ti uccido',
    'ammazzarti',
  ],
  violence: ['behead', 'bomb you', 'shoot you', 'stab you', 'cut your throat'],
  self_harm: [
    'kill myself',
    'suicide',
    'self harm',
    'uccidermi',
    'suicidio',
    'আত্মহত্যা',
  ],
  harassment: ['go die', 'kys', 'worthless', 'stalking you'],
};

@Injectable()
export class MessageKeywordScannerService {
  private readonly keywords: Record<ModerationCategory, string[]>;
  private readonly maxInputCharacters: number;

  constructor(private readonly configService: ConfigService) {
    const allowlist = new Set(
      this.parseList(
        this.configService.get<string>('CHAT_MODERATION_ALLOWLIST'),
      )
        .map((term) => this.normalize(term))
        .filter(Boolean),
    );

    this.keywords = Object.fromEntries(
      MODERATION_CATEGORIES.map((category) => {
        const configured = this.configService.get<string>(
          `CHAT_MODERATION_KEYWORDS_${category.toUpperCase()}`,
        );
        const source = configured?.trim()
          ? this.parseList(configured)
          : DEFAULT_KEYWORDS[category];
        const normalized = [
          ...new Set(source.map((term) => this.normalize(term))),
        ].filter((term) => term && !allowlist.has(term));
        return [category, normalized];
      }),
    ) as Record<ModerationCategory, string[]>;

    this.maxInputCharacters = this.numberConfig(
      'CHAT_MODERATION_MAX_INPUT_CHARACTERS',
      4_000,
      250,
      20_000,
    );
  }

  scan(content: string | null | undefined): KeywordScanResult {
    const normalized = this.normalize(
      (content ?? '').slice(0, this.maxInputCharacters),
    );
    if (!normalized) {
      return { suspicious: false, categories: [], matchedTerms: [] };
    }

    const searchable = ` ${normalized} `;
    const categories: ModerationCategory[] = [];
    const matchedTerms: string[] = [];

    for (const category of MODERATION_CATEGORIES) {
      const matches = this.keywords[category].filter((term) =>
        searchable.includes(` ${term} `),
      );
      if (matches.length > 0) {
        categories.push(category);
        matchedTerms.push(...matches);
      }
    }

    return {
      suspicious: matchedTerms.length > 0,
      categories,
      matchedTerms: [...new Set(matchedTerms)],
    };
  }

  private normalize(value: string): string {
    return value
      .normalize('NFKC')
      .toLocaleLowerCase('en-US')
      .replace(/[@]/g, 'a')
      .replace(/[$5]/g, 's')
      .replace(/0/g, 'o')
      .replace(/[1!]/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/7/g, 't')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
  }

  private parseList(value: string | undefined): string[] {
    if (!value?.trim()) return [];
    return value
      .split(',')
      .map((term) => term.trim())
      .filter(Boolean);
  }

  private numberConfig(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ): number {
    const parsed = Number(this.configService.get<string>(key));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.floor(parsed)));
  }
}
