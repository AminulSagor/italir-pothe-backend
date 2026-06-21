import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  IMPORTANT_VERB_FORM_DEFINITIONS,
  IMPORTANT_VERB_PRONOUNS,
} from "../constants/important-verb-forms.constant";
import { ImportantVerbConjugation } from "../entities/important-verb-conjugation.entity";
import { ImportantVerbForm } from "../entities/important-verb-form.entity";
import { ImportantVerb } from "../entities/important-verb.entity";
import { ImportantVerbRulesService } from "../services/important-verb-rules.service";
import {
  ImportantVerbFormKey,
  ImportantVerbPersonKey,
} from "../types/important-verb.type";
import {
  normalizeText,
  readTextLines,
  sha256,
} from "../utils/data-source.util";

export type UniMorphImportStats = {
  scanned: number;
  matched: number;
  validated: number;
  inserted: number;
  mismatched: number;
  skipped: number;
  failed: number;
};

@Injectable()
export class UniMorphImporterService {
  private readonly logger = new Logger(UniMorphImporterService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly rules: ImportantVerbRulesService,

    @InjectRepository(ImportantVerb)
    private readonly verbRepository: Repository<ImportantVerb>,

    @InjectRepository(ImportantVerbForm)
    private readonly formRepository: Repository<ImportantVerbForm>,

    @InjectRepository(ImportantVerbConjugation)
    private readonly conjugationRepository: Repository<ImportantVerbConjugation>,
  ) {}

  async import() {
    const source =
      this.configService.get<string>("IMPORTANT_VERBS_UNIMORPH_SOURCE") ??
      "https://raw.githubusercontent.com/unimorph/ita/master/ita";

    const verbs = await this.verbRepository.find({
      select: {
        id: true,
        infinitive: true,
        englishMeaning: true,
      },
    });

    const verbsByInfinitive = new Map(
      verbs.map((verb) => [verb.infinitive.toLowerCase(), verb]),
    );
    const formCache = new Map<string, ImportantVerbForm>();

    const stats: UniMorphImportStats = {
      scanned: 0,
      matched: 0,
      validated: 0,
      inserted: 0,
      mismatched: 0,
      skipped: 0,
      failed: 0,
    };

    for await (const line of readTextLines(source)) {
      stats.scanned += 1;

      const [rawLemma, rawForm, rawFeatures] = line.split("\t");
      const lemma = normalizeText(rawLemma).toLowerCase();
      const conjugatedText = normalizeText(rawForm);
      const features = normalizeText(rawFeatures);

      if (!lemma || !conjugatedText || !features) {
        stats.skipped += 1;
        continue;
      }

      const verb = verbsByInfinitive.get(lemma);
      if (!verb) continue;

      const mapped = this.rules.mapUniMorphFeatures(features);
      if (!mapped) {
        stats.skipped += 1;
        continue;
      }

      stats.matched += 1;

      try {
        const form = await this.getOrCreateForm(
          verb.id,
          mapped.formKey,
          formCache,
        );
        const pronouns = IMPORTANT_VERB_PRONOUNS[mapped.personKey];

        const existing = await this.conjugationRepository.findOne({
          where: {
            formId: form.id,
            personKey: mapped.personKey,
          },
        });

        if (existing) {
          const existingText =
            existing.conjugatedText.toLocaleLowerCase("it-IT");
          const uniMorphText = conjugatedText.toLocaleLowerCase("it-IT");

          if (existingText === uniMorphText) {
            stats.validated += 1;
            continue;
          }

          // UniMorph is the canonical spelling source for simple forms.
          // This corrects stress-marked Kaikki spellings such as pàrlo -> parlo.
          existing.conjugatedText = conjugatedText;
          existing.sourceTags = [
            "unimorph",
            ...features.split(";").filter(Boolean),
          ];
          existing.sourceHash = sha256({
            source: "unimorph",
            lemma,
            conjugatedText,
            features,
          });
          existing.translationSourceHash = null;

          await this.conjugationRepository.save(existing);
          stats.mismatched += 1;
          continue;
        }

        await this.conjugationRepository.save(
          this.conjugationRepository.create({
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
            sourceTags: ["unimorph", ...features.split(";").filter(Boolean)],
            sortOrder: pronouns.sortOrder,
            sourceHash: sha256({
              source: "unimorph",
              lemma,
              conjugatedText,
              features,
            }),
          }),
        );

        stats.inserted += 1;
      } catch (error) {
        stats.failed += 1;
        this.logger.error(
          `Failed importing UniMorph row for "${lemma}"`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    return stats;
  }

  private async getOrCreateForm(
    verbId: string,
    formKey: ImportantVerbFormKey,
    cache: Map<string, ImportantVerbForm>,
  ) {
    const cacheKey = `${verbId}:${formKey}`;
    const cached = cache.get(cacheKey);
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

    cache.set(cacheKey, form);
    return form;
  }
}
