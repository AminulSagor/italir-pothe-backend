import { setTimeout as delay } from 'node:timers/promises';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ImportantVerbExample } from '../entities/important-verb-example.entity';
import { ImportantVerbForm } from '../entities/important-verb-form.entity';
import { ImportantVerbRulesService } from '../services/important-verb-rules.service';
import {
  ImportantVerbExampleSource,
  ImportantVerbPersonKey,
} from '../types/important-verb.type';
import {
  containsWholeWord,
  normalizeText,
  sha256,
} from '../utils/data-source.util';

type TatoebaCandidate = {
  id: string | number | null;
  italianText: string;
  englishText: string;
};

export type TatoebaImportStats = {
  inspectedForms: number;
  requested: number;
  tatoebaExamples: number;
  fallbackExamples: number;
  skipped: number;
  failed: number;
};

@Injectable()
export class TatoebaImporterService {
  private readonly logger = new Logger(TatoebaImporterService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rules: ImportantVerbRulesService,

    @InjectRepository(ImportantVerbForm)
    private readonly formRepository: Repository<ImportantVerbForm>,

    @InjectRepository(ImportantVerbExample)
    private readonly exampleRepository: Repository<ImportantVerbExample>,
  ) {}

  async importMissingExamples() {
    const enabled =
      this.configService.get<string>('IMPORTANT_VERBS_TATOEBA_ENABLED') !==
      'false';
    const maxRequests = Number(
      this.configService.get<string>('IMPORTANT_VERBS_TATOEBA_MAX_REQUESTS') ??
        500,
    );
    const requestDelayMs = Number(
      this.configService.get<string>(
        'IMPORTANT_VERBS_TATOEBA_REQUEST_DELAY_MS',
      ) ?? 150,
    );
    const requestTimeoutMs = Number(
      this.configService.get<string>('IMPORTANT_VERBS_TATOEBA_TIMEOUT_MS') ??
        15000,
    );

    const forms = await this.formRepository.find({
      relations: {
        verb: true,
        conjugations: true,
        examples: true,
      },
      order: {
        sortOrder: 'ASC',
      },
    });

    const stats: TatoebaImportStats = {
      inspectedForms: 0,
      requested: 0,
      tatoebaExamples: 0,
      fallbackExamples: 0,
      skipped: 0,
      failed: 0,
    };

    this.logger.log(
      `Tatoeba example stage: ${forms.length} forms, maximum ${maxRequests} requests`,
    );

    for (const form of forms) {
      stats.inspectedForms += 1;

      const existingTatoebaExample = form.examples?.some(
        (example) => example.source === ImportantVerbExampleSource.TATOEBA,
      );

      if (existingTatoebaExample) {
        stats.skipped += 1;
        continue;
      }

      const conjugation = this.pickConjugation(form);
      if (!conjugation) {
        stats.skipped += 1;
        continue;
      }

      let candidate: TatoebaCandidate | null = null;

      if (enabled && stats.requested < maxRequests) {
        stats.requested += 1;

        try {
          candidate = await this.searchTatoeba(
            conjugation.conjugatedText,
            requestTimeoutMs,
          );
        } catch (error) {
          stats.failed += 1;
          this.logger.warn(
            `Tatoeba lookup failed for "${conjugation.conjugatedText}": ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }

        if (
          stats.requested === 1 ||
          stats.requested % 25 === 0 ||
          stats.requested === maxRequests
        ) {
          this.logger.log(
            `Tatoeba progress: ${stats.requested}/${maxRequests} requests, ` +
              `${stats.tatoebaExamples} examples found, ${stats.failed} failed`,
          );
        }

        if (requestDelayMs > 0) {
          await delay(requestDelayMs);
        }
      }

      if (
        stats.inspectedForms === 1 ||
        stats.inspectedForms % 1000 === 0 ||
        stats.inspectedForms === forms.length
      ) {
        this.logger.log(
          `Example progress: ${stats.inspectedForms}/${forms.length} forms inspected, ` +
            `${stats.tatoebaExamples} Tatoeba, ${stats.fallbackExamples} fallback`,
        );
      }

      if (candidate) {
        await this.exampleRepository.delete({
          formId: form.id,
          source: ImportantVerbExampleSource.TEMPLATE,
        });

        await this.saveExample({
          form,
          conjugationId: conjugation.id,
          italianText: candidate.italianText,
          englishText: candidate.englishText,
          source: ImportantVerbExampleSource.TATOEBA,
          sourceReference:
            candidate.id === null
              ? 'https://tatoeba.org'
              : `https://tatoeba.org/en/sentences/show/${candidate.id}`,
          sourceLicense: 'CC BY 2.0 FR',
        });
        stats.tatoebaExamples += 1;
        continue;
      }

      const existingFallback = form.examples?.some(
        (example) => example.source === ImportantVerbExampleSource.TEMPLATE,
      );

      if (existingFallback) {
        stats.skipped += 1;
        continue;
      }

      const fallback = this.rules.buildFallbackExample({
        italianConjugation: conjugation.conjugatedText,
        englishMeaning: form.verb.englishMeaning,
        formKey: form.formKey,
        personKey: conjugation.personKey,
      });

      await this.saveExample({
        form,
        conjugationId: conjugation.id,
        italianText: fallback.italianText,
        englishText: fallback.englishText,
        source: ImportantVerbExampleSource.TEMPLATE,
        sourceReference: null,
        sourceLicense: null,
      });
      stats.fallbackExamples += 1;
    }

    return stats;
  }

  private pickConjugation(form: ImportantVerbForm) {
    const conjugations = [...(form.conjugations ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

    return (
      conjugations.find(
        (item) => item.personKey === ImportantVerbPersonKey.IO,
      ) ??
      conjugations.find(
        (item) => item.personKey === ImportantVerbPersonKey.BASE,
      ) ??
      conjugations[0] ??
      null
    );
  }

  private async searchTatoeba(
    conjugatedText: string,
    requestTimeoutMs: number,
  ): Promise<TatoebaCandidate | null> {
    const searchText = normalizeText(conjugatedText).trim();

    if (!searchText || searchText === '-') {
      return null;
    }

    const endpoint =
      this.configService.get<string>('IMPORTANT_VERBS_TATOEBA_ENDPOINT') ??
      'https://api.tatoeba.org/v1/sentences';

    const url = new URL(endpoint);
    url.searchParams.set('lang', 'ita');
    url.searchParams.set('q', searchText);
    url.searchParams.set('word_count', '2-14');
    url.searchParams.set('is_unapproved', 'no');
    url.searchParams.set('is_orphan', 'no');
    url.searchParams.set('trans:lang', 'eng');
    url.searchParams.set('trans:is_direct', 'yes');
    url.searchParams.set('trans:is_unapproved', 'no');
    url.searchParams.set('showtrans:lang', 'eng');
    url.searchParams.set('showtrans:is_direct', 'yes');
    url.searchParams.set('sort', 'relevance');
    url.searchParams.set('limit', '10');

    const response = await fetch(url, {
      headers: {
        accept: 'application/json',
        'user-agent': 'italir-pothe-important-verbs/1.0',
      },
      signal: AbortSignal.timeout(Math.max(1000, requestTimeoutMs)),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 500)}`);
    }

    const payload = (await response.json()) as unknown;
    const rows = this.extractRows(payload);

    for (const row of rows) {
      const italianText = this.findText(row, 'ita', true);
      const englishText = this.findText(row, 'eng', false);

      if (
        italianText &&
        englishText &&
        containsWholeWord(italianText, searchText)
      ) {
        return {
          id: this.findId(row),
          italianText,
          englishText,
        };
      }
    }

    return null;
  }

  private extractRows(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];

    const record = payload as Record<string, unknown>;

    for (const key of ['data', 'results', 'sentences', 'items']) {
      if (Array.isArray(record[key])) {
        return record[key] as unknown[];
      }
    }

    return [];
  }

  private findText(
    value: unknown,
    language: 'ita' | 'eng',
    allowRootText: boolean,
  ): string {
    if (!value || typeof value !== 'object') return '';

    const record = value as Record<string, unknown>;
    const recordLanguage = normalizeText(
      record.lang ?? record.language ?? record.lang_code,
    ).toLowerCase();
    const directText = normalizeText(
      record.text ?? record.sentence ?? record.content,
    );

    if (
      directText &&
      (recordLanguage === language || (allowRootText && !recordLanguage))
    ) {
      return directText;
    }

    for (const [key, child] of Object.entries(record)) {
      if (
        language === 'eng' &&
        !['translations', 'translation', 'trans', 'direct_translations'].some(
          (name) => key.toLowerCase().includes(name),
        )
      ) {
        continue;
      }

      const found = this.findTextInChildren(child, language);
      if (found) return found;
    }

    return '';
  }

  private findTextInChildren(value: unknown, language: 'ita' | 'eng'): string {
    if (Array.isArray(value)) {
      for (const item of value) {
        const found = this.findTextInChildren(item, language);
        if (found) return found;
      }
      return '';
    }

    if (!value || typeof value !== 'object') return '';

    const record = value as Record<string, unknown>;
    const recordLanguage = normalizeText(
      record.lang ?? record.language ?? record.lang_code,
    ).toLowerCase();
    const directText = normalizeText(
      record.text ?? record.sentence ?? record.content,
    );

    if (directText && recordLanguage === language) {
      return directText;
    }

    for (const child of Object.values(record)) {
      const found = this.findTextInChildren(child, language);
      if (found) return found;
    }

    return '';
  }

  private findId(value: unknown): string | number | null {
    if (!value || typeof value !== 'object') return null;
    const id = (value as Record<string, unknown>).id;

    return typeof id === 'string' || typeof id === 'number' ? id : null;
  }

  private async saveExample(params: {
    form: ImportantVerbForm;
    conjugationId: string;
    italianText: string;
    englishText: string;
    source: ImportantVerbExampleSource;
    sourceReference: string | null;
    sourceLicense: string | null;
  }) {
    const sourceHash = sha256({
      formId: params.form.id,
      italianText: params.italianText,
      englishText: params.englishText,
      source: params.source,
    });

    const exists = await this.exampleRepository.exist({
      where: { sourceHash },
    });

    if (exists) return;

    await this.exampleRepository.save(
      this.exampleRepository.create({
        formId: params.form.id,
        conjugationId: params.conjugationId,
        italianText: params.italianText,
        englishText: params.englishText,
        banglaText: null,
        source: params.source,
        sourceReference: params.sourceReference,
        sourceLicense: params.sourceLicense,
        sortOrder: 1,
        sourceHash,
        translationSourceHash: null,
      }),
    );
  }
}
