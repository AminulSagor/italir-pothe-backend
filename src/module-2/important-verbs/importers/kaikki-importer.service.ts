import { readFile } from 'node:fs/promises';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  IMPORTANT_VERB_FORM_DEFINITIONS,
  IMPORTANT_VERB_PRONOUNS,
} from '../constants/important-verb-forms.constant';
import { DEFAULT_IMPORTANT_VERB_LEMMAS } from '../data/default-important-verbs';
import { ImportantVerbConjugation } from '../entities/important-verb-conjugation.entity';
import { ImportantVerbExample } from '../entities/important-verb-example.entity';
import { ImportantVerbForm } from '../entities/important-verb-form.entity';
import { ImportantVerb } from '../entities/important-verb.entity';
import { ImportantVerbRulesService } from '../services/important-verb-rules.service';
import {
  ImportantVerbExampleSource,
  ImportantVerbFormKey,
  ImportantVerbPersonKey,
} from '../types/important-verb.type';
import {
  containsWholeWord,
  normalizeText,
  readTextLines,
  sha256,
  uniqueNonEmpty,
} from '../utils/data-source.util';

type KaikkiForm = {
  form?: string;
  tags?: string[];
};

type KaikkiExample = {
  text?: string;
  translation?: string;
  english?: string;
};

type KaikkiSense = {
  glosses?: string[];
  raw_glosses?: string[];
  tags?: string[];
  categories?: Array<string | { name?: string }>;
  examples?: KaikkiExample[];
  form_of?: Array<{ word?: string }>;
};

type KaikkiRecord = {
  word?: string;
  lang_code?: string;
  pos?: string;
  forms?: KaikkiForm[];
  senses?: KaikkiSense[];
  categories?: Array<string | { name?: string }>;
  tags?: string[];
  sounds?: Array<Record<string, unknown>>;
};

export type KaikkiImportStats = {
  target: number;
  scanned: number;
  matched: number;
  priorityMatched: number;
  bulkMatched: number;
  imported: number;
  unchanged: number;
  forms: number;
  conjugations: number;
  examples: number;
  failed: number;
};

@Injectable()
export class KaikkiImporterService {
  private readonly logger = new Logger(KaikkiImporterService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rules: ImportantVerbRulesService,

    @InjectRepository(ImportantVerb)
    private readonly verbRepository: Repository<ImportantVerb>,

    @InjectRepository(ImportantVerbForm)
    private readonly formRepository: Repository<ImportantVerbForm>,

    @InjectRepository(ImportantVerbConjugation)
    private readonly conjugationRepository: Repository<ImportantVerbConjugation>,

    @InjectRepository(ImportantVerbExample)
    private readonly exampleRepository: Repository<ImportantVerbExample>,
  ) {}

  async import() {
    const source =
      this.configService.get<string>('IMPORTANT_VERBS_KAIKKI_SOURCE') ??
      'https://kaikki.org/dictionary/Italian/kaikki.org-dictionary-Italian.jsonl';

    const importAll =
      this.configService.get<string>('IMPORTANT_VERBS_IMPORT_ALL') !== 'false';
    const configuredMaximum = Number(
      this.configService.get<string>('IMPORTANT_VERBS_MAX_VERBS') ?? 1000,
    );
    const maximum = Number.isFinite(configuredMaximum)
      ? Math.max(1, Math.floor(configuredMaximum))
      : 1000;
    const allowlist = (await this.loadAllowlist()).slice(0, maximum);
    const allowlistSet = new Set(allowlist);
    const allowlistOrder = new Map<string, number>(
      allowlist.map((lemma, index) => [lemma, index + 1] as const),
    );
    const processed = new Set<string>();
    const processedPriority = new Set<string>();
    const priorityTarget = allowlist.length;
    const bulkTarget = importAll ? Math.max(0, maximum - priorityTarget) : 0;
    let bulkProcessed = 0;

    const stats: KaikkiImportStats = {
      target: maximum,
      scanned: 0,
      matched: 0,
      priorityMatched: 0,
      bulkMatched: 0,
      imported: 0,
      unchanged: 0,
      forms: 0,
      conjugations: 0,
      examples: 0,
      failed: 0,
    };

    for await (const line of readTextLines(source)) {
      stats.scanned += 1;

      if (!line.trim()) continue;

      let record: KaikkiRecord;

      try {
        record = JSON.parse(line) as KaikkiRecord;
      } catch {
        stats.failed += 1;
        continue;
      }

      const infinitive = normalizeText(record.word).toLowerCase();

      if (
        !infinitive ||
        record.pos !== 'verb' ||
        (record.lang_code && record.lang_code !== 'it') ||
        this.isOnlyInflectedForm(record) ||
        processed.has(infinitive)
      ) {
        continue;
      }

      const isPriority = allowlistSet.has(infinitive);

      if (!isPriority) {
        if (
          !importAll ||
          bulkProcessed >= bulkTarget ||
          !this.isUsableBulkVerb(record, infinitive)
        ) {
          continue;
        }
      }

      stats.matched += 1;
      if (isPriority) {
        stats.priorityMatched += 1;
      } else {
        stats.bulkMatched += 1;
      }

      const sortOrder = isPriority
        ? (allowlistOrder.get(infinitive) ?? processedPriority.size + 1)
        : priorityTarget + bulkProcessed + 1;

      try {
        const imported = await this.persistRecord(
          record,
          infinitive,
          stats,
          sortOrder,
        );
        processed.add(infinitive);

        if (isPriority) {
          processedPriority.add(infinitive);
        } else {
          bulkProcessed += 1;
        }

        if (imported) {
          stats.imported += 1;
        } else {
          stats.unchanged += 1;
        }

        if (processed.size === 1 || processed.size % 100 === 0) {
          this.logger.log(
            `Kaikki progress: ${processed.size}/${maximum} verbs selected ` +
              `(${processedPriority.size} priority, ${bulkProcessed} bulk)`,
          );
        }
      } catch (error) {
        stats.failed += 1;
        this.logger.error(
          `Failed importing Kaikki verb "${infinitive}"`,
          error instanceof Error ? error.stack : String(error),
        );
      }

      const priorityComplete = processedPriority.size >= priorityTarget;
      const bulkComplete = bulkProcessed >= bulkTarget;

      if (
        (!importAll && priorityComplete) ||
        (importAll && priorityComplete && bulkComplete)
      ) {
        break;
      }
    }

    if (processed.size < maximum) {
      this.logger.warn(
        `Kaikki import selected only ${processed.size}/${maximum} usable verbs. ` +
          `Relax the bulk filters or provide IMPORTANT_VERBS_LEMMA_FILE to fill the remainder.`,
      );
    } else {
      this.logger.log(
        `Kaikki selection completed with ${processed.size} verbs.`,
      );
    }

    return stats;
  }

  private async persistRecord(
    record: KaikkiRecord,
    infinitive: string,
    stats: KaikkiImportStats,
    sortOrder: number,
  ) {
    const categories = this.extractCategories(record);
    const tags = uniqueNonEmpty([
      ...(record.tags ?? []),
      ...categories,
      ...(record.senses ?? []).flatMap((sense) => sense.tags ?? []),
    ]);

    const englishMeaning = this.extractEnglishMeaning(record);
    const sourceVersion =
      this.configService.get<string>('IMPORTANT_VERBS_SOURCE_VERSION') ??
      new Date().toISOString().slice(0, 10);

    const sourceHash = sha256({
      infinitive,
      sortOrder,
      englishMeaning,
      tags,
      forms: record.forms ?? [],
      senses: record.senses ?? [],
    });

    let verb = await this.verbRepository.findOne({
      where: { infinitive },
    });

    if (verb?.sourceHash === sourceHash) {
      return false;
    }

    if (!verb) {
      verb = this.verbRepository.create({
        infinitive,
        slug: this.rules.slugify(infinitive),
        italianMeaning: null,
        frequencyRank: null,
        sortOrder,
        isPublished: true,
      });
    }

    verb.englishMeaning = englishMeaning ?? verb.englishMeaning ?? null;
    verb.endingType = this.rules.determineEndingType(infinitive);
    verb.regularity = this.rules.determineRegularity({
      infinitive,
      tags,
      categories,
    });
    verb.auxiliary = this.rules.determineAuxiliary({
      infinitive,
      tags,
      categories,
    });
    verb.tags = tags;
    verb.sortOrder = sortOrder;
    verb.sourceHash = sourceHash;
    verb.sourceVersion = sourceVersion;

    verb = await this.verbRepository.save(verb);

    const formCache = new Map<ImportantVerbFormKey, ImportantVerbForm>();
    const conjugationCandidates: Array<{
      form: ImportantVerbForm;
      conjugation: ImportantVerbConjugation;
    }> = [];
    const canonicalConjugations = new Set<string>();

    for (const rawForm of record.forms ?? []) {
      const conjugatedText = normalizeText(rawForm.form);
      const mapped = this.rules.mapKaikkiForm(rawForm.tags);

      if (!conjugatedText || conjugatedText === '-' || !mapped) continue;

      const rawTags = (rawForm.tags ?? []).map((tag) =>
        String(tag).toLowerCase(),
      );
      const noisyForm = rawTags.some((tag) =>
        [
          'combined-form',
          'negative',
          'archaic',
          'obsolete',
          'rare',
          'nonstandard',
          'pronunciation-spelling',
        ].includes(tag),
      );

      if (noisyForm || /\s/u.test(conjugatedText)) {
        continue;
      }

      const canonicalKey = `${mapped.formKey}:${mapped.personKey}`;
      if (canonicalConjugations.has(canonicalKey)) {
        continue;
      }
      canonicalConjugations.add(canonicalKey);

      const form = await this.getOrCreateForm(
        verb.id,
        mapped.formKey,
        formCache,
      );

      const pronouns = IMPORTANT_VERB_PRONOUNS[mapped.personKey];
      const conjugationHash = sha256({
        source: 'kaikki',
        infinitive,
        conjugatedText,
        tags: rawForm.tags ?? [],
      });

      await this.conjugationRepository.upsert(
        {
          formId: form.id,
          personKey: mapped.personKey,
          pronounIt: pronouns.it || null,
          pronounEn: pronouns.en || null,
          pronounBn: pronouns.bn || null,
          conjugatedText,
          englishMeaning: this.rules.buildEnglishConjugation({
            englishMeaning: verb.englishMeaning,
            formKey: mapped.formKey,
            personKey: mapped.personKey,
          }),
          sourceTags: ['kaikki', ...(rawForm.tags ?? [])],
          sortOrder: pronouns.sortOrder,
          sourceHash: conjugationHash,
        },
        ['formId', 'personKey'],
      );

      const conjugation = await this.conjugationRepository.findOneOrFail({
        where: {
          formId: form.id,
          personKey: mapped.personKey,
        },
      });

      conjugationCandidates.push({ form, conjugation });
      stats.conjugations += 1;
    }

    if (
      !conjugationCandidates.some(
        (candidate) =>
          candidate.form.formKey === ImportantVerbFormKey.INFINITIVE_PRESENT,
      )
    ) {
      const form = await this.getOrCreateForm(
        verb.id,
        ImportantVerbFormKey.INFINITIVE_PRESENT,
        formCache,
      );

      await this.conjugationRepository.upsert(
        {
          formId: form.id,
          personKey: ImportantVerbPersonKey.BASE,
          pronounIt: null,
          pronounEn: null,
          pronounBn: null,
          conjugatedText: infinitive,
          englishMeaning: verb.englishMeaning,
          sourceTags: ['infinitive'],
          sortOrder: 1,
          sourceHash: sha256({ source: 'kaikki', infinitive }),
        },
        ['formId', 'personKey'],
      );
    }

    for (const sense of record.senses ?? []) {
      for (const rawExample of sense.examples ?? []) {
        const italianText = normalizeText(rawExample.text);
        const englishText = normalizeText(
          rawExample.translation ?? rawExample.english,
        );

        if (!italianText) continue;

        const candidate = conjugationCandidates.find(({ conjugation }) =>
          containsWholeWord(italianText, conjugation.conjugatedText),
        );

        if (!candidate) continue;

        const exampleHash = sha256({
          source: 'kaikki',
          infinitive,
          italianText,
          englishText,
        });

        const exists = await this.exampleRepository.exist({
          where: { sourceHash: exampleHash },
        });

        if (exists) continue;

        await this.exampleRepository.save(
          this.exampleRepository.create({
            formId: candidate.form.id,
            conjugationId: candidate.conjugation.id,
            italianText,
            englishText: englishText || null,
            banglaText: null,
            source: ImportantVerbExampleSource.KAIKKI,
            sourceReference: `kaikki:${infinitive}`,
            sourceLicense: 'Wiktionary source licence applies',
            sortOrder: 0,
            sourceHash: exampleHash,
          }),
        );

        stats.examples += 1;
      }
    }

    stats.forms += formCache.size;
    return true;
  }

  private async getOrCreateForm(
    verbId: string,
    formKey: ImportantVerbFormKey,
    cache: Map<ImportantVerbFormKey, ImportantVerbForm>,
  ) {
    const cached = cache.get(formKey);
    if (cached) return cached;

    let form = await this.formRepository.findOne({
      where: { verbId, formKey },
    });

    if (!form) {
      const definition = IMPORTANT_VERB_FORM_DEFINITIONS.find(
        (item) => item.key === formKey,
      );

      if (!definition) {
        throw new Error(`Missing form definition for ${formKey}`);
      }

      form = await this.formRepository.save(
        this.formRepository.create({
          verbId,
          formKey,
          titleEn: definition.titleEn,
          titleBn: definition.titleBn,
          titleIt: definition.titleIt,
          descriptionEn: definition.descriptionEn,
          descriptionBn: definition.descriptionBn,
          descriptionIt: definition.descriptionIt,
          isCompound: definition.compound,
          sortOrder: definition.sortOrder,
          sourceHash: null,
        }),
      );
    }

    cache.set(formKey, form);
    return form;
  }

  private isUsableBulkVerb(record: KaikkiRecord, infinitive: string) {
    const englishMeaning = this.extractEnglishMeaning(record);
    if (!englishMeaning) return false;

    // Keep the mobile library focused on standalone dictionary infinitives.
    // Multi-word phrases, clitic spellings and non-letter headwords are skipped.
    if (infinitive.length > 60 || !/^[a-zàèéìòóù]+re$/iu.test(infinitive)) {
      return false;
    }

    const tags = uniqueNonEmpty([
      ...(record.tags ?? []),
      ...this.extractCategories(record),
      ...(record.senses ?? []).flatMap((sense) => sense.tags ?? []),
    ]).map((value) => value.toLowerCase());

    const excludedMarkers = [
      'archaic',
      'obsolete',
      'rare',
      'nonstandard',
      'dated',
      'historical',
      'dialectal',
      'misspelling',
      'pronunciation spelling',
    ];

    if (
      tags.some((tag) =>
        excludedMarkers.some((markerValue) => tag.includes(markerValue)),
      )
    ) {
      return false;
    }

    // Requiring forms prevents importing verb-like dictionary entries that
    // cannot power the conjugation UI.
    return (record.forms?.length ?? 0) >= 3;
  }

  private isOnlyInflectedForm(record: KaikkiRecord) {
    const senses = record.senses ?? [];
    return (
      senses.length > 0 &&
      senses.every((sense) => (sense.form_of?.length ?? 0) > 0)
    );
  }

  private extractEnglishMeaning(record: KaikkiRecord) {
    for (const sense of record.senses ?? []) {
      const gloss = uniqueNonEmpty([
        ...(sense.glosses ?? []),
        ...(sense.raw_glosses ?? []),
      ]).find(
        (value) => !/^(inflection|form|participle|gerund) of\b/i.test(value),
      );

      if (gloss) return gloss;
    }

    return null;
  }

  private extractCategories(record: KaikkiRecord) {
    const rawCategories = [
      ...(record.categories ?? []),
      ...(record.senses ?? []).flatMap((sense) => sense.categories ?? []),
    ];

    return uniqueNonEmpty(
      rawCategories.map((category) =>
        typeof category === 'string' ? category : category.name,
      ),
    );
  }

  private async loadAllowlist() {
    const filePath = this.configService.get<string>(
      'IMPORTANT_VERBS_LEMMA_FILE',
    );
    const inline = this.configService.get<string>('IMPORTANT_VERBS_LEMMAS');

    if (filePath) {
      const text = await readFile(filePath, 'utf8');
      return [
        ...new Set(
          text
            .split(/\r?\n/)
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
    }

    if (inline) {
      return [
        ...new Set(
          inline
            .split(',')
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
    }

    return [...DEFAULT_IMPORTANT_VERB_LEMMAS];
  }
}
