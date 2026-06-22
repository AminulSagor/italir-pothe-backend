import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import {
  COMPOUND_FORM_AUXILIARY_SOURCE,
  IMPORTANT_VERB_FORM_DEFINITIONS,
  IMPORTANT_VERB_PRONOUNS,
} from "../constants/important-verb-forms.constant";
import { ImportantVerbConjugation } from "../entities/important-verb-conjugation.entity";
import { ImportantVerbExample } from "../entities/important-verb-example.entity";
import { ImportantVerbForm } from "../entities/important-verb-form.entity";
import { ImportantVerbImportRun } from "../entities/important-verb-import-run.entity";
import { ImportantVerb } from "../entities/important-verb.entity";
import { KaikkiImporterService } from "../importers/kaikki-importer.service";
import { TatoebaImporterService } from "../importers/tatoeba-importer.service";
import { UniMorphImporterService } from "../importers/unimorph-importer.service";
import {
  ImportantVerbAuxiliary,
  ImportantVerbFormKey,
  ImportantVerbImportRunStatus,
  ImportantVerbPersonKey,
  ImportantVerbRegularity,
} from "../types/important-verb.type";
import { sha256 } from "../utils/data-source.util";
import { LibreTranslateService } from "./libretranslate.service";
import { ImportantVerbRulesService } from "./important-verb-rules.service";

type TranslationTask =
  | {
      kind: "verb";
      id: string;
      text: string;
      hash: string;
    }
  | {
      kind: "conjugation";
      id: string;
      text: string;
      hash: string;
    }
  | {
      kind: "example";
      id: string;
      text: string;
      hash: string;
    };

@Injectable()
export class ImportantVerbsDataSyncService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ImportantVerbsDataSyncService.name);
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly kaikkiImporter: KaikkiImporterService,
    private readonly uniMorphImporter: UniMorphImporterService,
    private readonly tatoebaImporter: TatoebaImporterService,
    private readonly libreTranslate: LibreTranslateService,
    private readonly rules: ImportantVerbRulesService,

    @InjectRepository(ImportantVerb)
    private readonly verbRepository: Repository<ImportantVerb>,

    @InjectRepository(ImportantVerbForm)
    private readonly formRepository: Repository<ImportantVerbForm>,

    @InjectRepository(ImportantVerbConjugation)
    private readonly conjugationRepository: Repository<ImportantVerbConjugation>,

    @InjectRepository(ImportantVerbExample)
    private readonly exampleRepository: Repository<ImportantVerbExample>,

    @InjectRepository(ImportantVerbImportRun)
    private readonly importRunRepository: Repository<ImportantVerbImportRun>,
  ) {}

  onApplicationBootstrap() {
    if (
      this.configService.get<string>("IMPORTANT_VERBS_SYNC_ON_STARTUP") ===
      "true"
    ) {
      setImmediate(() => {
        void this.syncAll().catch((error) => {
          this.logger.error(
            "Important verbs startup sync failed",
            error instanceof Error ? error.stack : String(error),
          );
        });
      });
    }
  }

  @Cron("0 0 3 1 * *")
  async runScheduledSync() {
    if (
      this.configService.get<string>("IMPORTANT_VERBS_MONTHLY_SYNC_ENABLED") !==
      "true"
    ) {
      return;
    }

    await this.syncAll();
  }

  async syncAll() {
    if (this.running) {
      throw new Error("Important verbs sync is already running.");
    }

    this.running = true;

    const run = await this.importRunRepository.save(
      this.importRunRepository.create({
        status: ImportantVerbImportRunStatus.RUNNING,
        kaikkiSource:
          this.configService.get<string>("IMPORTANT_VERBS_KAIKKI_SOURCE") ??
          null,
        unimorphSource:
          this.configService.get<string>("IMPORTANT_VERBS_UNIMORPH_SOURCE") ??
          null,
        tatoebaSource:
          this.configService.get<string>("IMPORTANT_VERBS_TATOEBA_ENDPOINT") ??
          "https://api.tatoeba.org/v1/sentences",
        sourceVersion:
          this.configService.get<string>("IMPORTANT_VERBS_SOURCE_VERSION") ??
          new Date().toISOString().slice(0, 10),
        metrics: {},
        errorMessage: null,
        startedAt: new Date(),
        completedAt: null,
      }),
    );

    try {
      this.logger.log("Starting Kaikki import");
      const kaikki = await this.kaikkiImporter.import();

      this.logger.log("Starting UniMorph validation/fill");
      const unimorph = await this.uniMorphImporter.import();

      this.logger.log("Ensuring all 21 verb forms");
      const baseForms = await this.ensureAllFormsAndFallbacks();

      this.logger.log("Generating deterministic compound forms");
      const compoundForms = await this.generateCompoundForms();

      this.logger.log("Importing Tatoeba/fallback examples");
      const examples = await this.tatoebaImporter.importMissingExamples();

      this.logger.log(
        "Generating Bangla translations with local LibreTranslate",
      );
      const translations = await this.translateBanglaContent();

      run.status = ImportantVerbImportRunStatus.COMPLETED;
      run.metrics = {
        kaikki,
        unimorph,
        compoundForms: {
          ...baseForms,
          ...compoundForms,
        },
        examples,
        translations,
      };
      run.completedAt = new Date();

      await this.importRunRepository.save(run);

      return {
        message: "Important verbs sync completed successfully.",
        runId: run.id,
        metrics: run.metrics,
      };
    } catch (error) {
      run.status = ImportantVerbImportRunStatus.FAILED;
      run.errorMessage = error instanceof Error ? error.message : String(error);
      run.completedAt = new Date();
      await this.importRunRepository.save(run);
      throw error;
    } finally {
      this.running = false;
    }
  }

  private async ensureAllFormsAndFallbacks() {
    const verbs = await this.verbRepository.find();
    let formsCreated = 0;
    let simpleConjugationsCreated = 0;
    let englishMeaningsUpdated = 0;

    for (const verb of verbs) {
      for (const definition of IMPORTANT_VERB_FORM_DEFINITIONS) {
        let form = await this.formRepository.findOne({
          where: {
            verbId: verb.id,
            formKey: definition.key,
          },
        });

        if (!form) {
          form = await this.formRepository.save(
            this.formRepository.create({
              verbId: verb.id,
              formKey: definition.key,
              titleEn: definition.titleEn,
              titleBn: definition.titleBn,
              titleIt: definition.titleIt,
              descriptionEn: definition.descriptionEn,
              descriptionBn: definition.descriptionBn,
              descriptionIt: definition.descriptionIt,
              isCompound: definition.compound,
              sortOrder: definition.sortOrder,
              sourceHash: sha256(definition),
            }),
          );
          formsCreated += 1;
        }

        const existingConjugations = await this.conjugationRepository.find({
          where: { formId: form.id },
        });

        if (
          !definition.compound &&
          (verb.regularity === ImportantVerbRegularity.REGULAR ||
            definition.key === ImportantVerbFormKey.INFINITIVE_PRESENT)
        ) {
          const generated = this.rules.generateRegularSimpleConjugations(
            verb.infinitive,
            definition.key,
          );
          const existingPersonKeys = new Set(
            existingConjugations.map((item) => item.personKey),
          );

          for (const [rawPersonKey, conjugatedText] of Object.entries(
            generated,
          )) {
            if (!conjugatedText) continue;

            const personKey = rawPersonKey as ImportantVerbPersonKey;

            if (existingPersonKeys.has(personKey)) {
              continue;
            }

            const pronouns = IMPORTANT_VERB_PRONOUNS[personKey];

            await this.conjugationRepository.upsert(
              {
                formId: form.id,
                personKey,
                pronounIt: pronouns.it || null,
                pronounEn: pronouns.en || null,
                pronounBn: pronouns.bn || null,
                conjugatedText,
                englishMeaning: this.rules.buildEnglishConjugation({
                  englishMeaning: verb.englishMeaning,
                  formKey: definition.key,
                  personKey,
                }),
                sourceTags: ["deterministic", "regular"],
                sortOrder: pronouns.sortOrder,
                sourceHash: sha256({
                  source: "deterministic-regular",
                  infinitive: verb.infinitive,
                  formKey: definition.key,
                  personKey,
                  conjugatedText,
                }),
              },
              ["formId", "personKey"],
            );

            existingPersonKeys.add(personKey);
            simpleConjugationsCreated += 1;
          }
        }

        const currentConjugations =
          existingConjugations.length > 0
            ? existingConjugations
            : await this.conjugationRepository.find({
                where: { formId: form.id },
              });

        for (const conjugation of currentConjugations) {
          const englishMeaning = this.rules.buildEnglishConjugation({
            englishMeaning: verb.englishMeaning,
            formKey: definition.key,
            personKey: conjugation.personKey,
          });

          if (conjugation.englishMeaning !== englishMeaning) {
            conjugation.englishMeaning = englishMeaning;
            conjugation.translationSourceHash = null;
            await this.conjugationRepository.save(conjugation);
            englishMeaningsUpdated += 1;
          }
        }
      }
    }

    return {
      formsCreated,
      simpleConjugationsCreated,
      englishMeaningsUpdated,
    };
  }

  private async generateCompoundForms() {
    const verbs = await this.verbRepository.find({
      relations: {
        forms: {
          conjugations: true,
        },
      },
    });

    let generated = 0;
    let skipped = 0;

    for (const verb of verbs) {
      const participleForm = verb.forms.find(
        (form) => form.formKey === ImportantVerbFormKey.PAST_PARTICIPLE,
      );
      const participle =
        participleForm?.conjugations?.find(
          (item) => item.personKey === ImportantVerbPersonKey.BASE,
        )?.conjugatedText ??
        participleForm?.conjugations?.[0]?.conjugatedText ??
        this.rules.inferPastParticiple(verb.infinitive);

      if (!participle) {
        skipped += 1;
        continue;
      }

      const auxiliaryChoices = this.resolveAuxiliaryChoices(verb.auxiliary);

      for (const definition of IMPORTANT_VERB_FORM_DEFINITIONS.filter(
        (item) => item.compound,
      )) {
        const form = verb.forms.find((item) => item.formKey === definition.key);

        if (!form) {
          skipped += 1;
          continue;
        }

        if (
          definition.key === ImportantVerbFormKey.INFINITIVE_PAST ||
          definition.key === ImportantVerbFormKey.GERUND_PAST
        ) {
          const sourceKey =
            definition.key === ImportantVerbFormKey.INFINITIVE_PAST
              ? ImportantVerbFormKey.INFINITIVE_PRESENT
              : ImportantVerbFormKey.GERUND_PRESENT;

          const combinedText = auxiliaryChoices
            .map((auxiliary) => {
              const auxiliaryForm = this.rules.getAuxiliaryForm({
                auxiliary,
                sourceFormKey: sourceKey,
                personKey: ImportantVerbPersonKey.BASE,
              });

              if (!auxiliaryForm) return null;

              const agreed =
                auxiliary === "essere"
                  ? this.rules.applyEssereAgreement(
                      participle,
                      ImportantVerbPersonKey.BASE,
                    )
                  : participle;

              return `${auxiliaryForm} ${agreed}`;
            })
            .filter(Boolean)
            .join(" / ");

          if (!combinedText) continue;

          await this.saveGeneratedConjugation({
            verb,
            form,
            formKey: definition.key,
            personKey: ImportantVerbPersonKey.BASE,
            conjugatedText: combinedText,
          });
          generated += 1;
          continue;
        }

        const sourceKey = COMPOUND_FORM_AUXILIARY_SOURCE[definition.key];

        if (!sourceKey) continue;

        for (const personKey of [
          ImportantVerbPersonKey.IO,
          ImportantVerbPersonKey.TU,
          ImportantVerbPersonKey.LUI_LEI,
          ImportantVerbPersonKey.NOI,
          ImportantVerbPersonKey.VOI,
          ImportantVerbPersonKey.LORO,
        ]) {
          const combinedText = auxiliaryChoices
            .map((auxiliary) => {
              const auxiliaryForm = this.rules.getAuxiliaryForm({
                auxiliary,
                sourceFormKey: sourceKey,
                personKey,
              });

              if (!auxiliaryForm) return null;

              const agreed =
                auxiliary === "essere"
                  ? this.rules.applyEssereAgreement(participle, personKey)
                  : participle;

              return `${auxiliaryForm} ${agreed}`;
            })
            .filter(Boolean)
            .join(" / ");

          if (!combinedText) continue;

          await this.saveGeneratedConjugation({
            verb,
            form,
            formKey: definition.key,
            personKey,
            conjugatedText: combinedText,
          });
          generated += 1;
        }
      }
    }

    return { generated, skipped };
  }

  private async saveGeneratedConjugation(params: {
    verb: ImportantVerb;
    form: ImportantVerbForm;
    formKey: ImportantVerbFormKey;
    personKey: ImportantVerbPersonKey;
    conjugatedText: string;
  }) {
    const pronouns = IMPORTANT_VERB_PRONOUNS[params.personKey];

    await this.conjugationRepository.upsert(
      {
        formId: params.form.id,
        personKey: params.personKey,
        pronounIt: pronouns.it || null,
        pronounEn: pronouns.en || null,
        pronounBn: pronouns.bn || null,
        conjugatedText: params.conjugatedText,
        englishMeaning: this.rules.buildEnglishConjugation({
          englishMeaning: params.verb.englishMeaning,
          formKey: params.formKey,
          personKey: params.personKey,
        }),
        sourceTags: ["deterministic", "compound"],
        sortOrder: pronouns.sortOrder,
        sourceHash: sha256({
          source: "deterministic-compound",
          infinitive: params.verb.infinitive,
          formKey: params.formKey,
          personKey: params.personKey,
          conjugatedText: params.conjugatedText,
        }),
      },
      ["formId", "personKey"],
    );
  }

  private resolveAuxiliaryChoices(
    auxiliary: ImportantVerbAuxiliary,
  ): Array<"avere" | "essere"> {
    if (auxiliary === ImportantVerbAuxiliary.ESSERE) {
      return ["essere"];
    }

    if (auxiliary === ImportantVerbAuxiliary.BOTH) {
      return ["avere", "essere"];
    }

    return ["avere"];
  }

  private async translateBanglaContent() {
    if (!this.libreTranslate.isConfigured()) {
      return {
        configured: 0,
        requested: 0,
        translated: 0,
        skipped: 0,
      };
    }

    const verbs = await this.verbRepository.find();
    const conjugations = await this.conjugationRepository.find();
    const examples = await this.exampleRepository.find();

    const tasks: TranslationTask[] = [];
    let skipped = 0;

    for (const verb of verbs) {
      if (!verb.englishMeaning) {
        skipped += 1;
        continue;
      }

      const hash = this.libreTranslate.buildTranslationSourceHash(
        verb.englishMeaning,
      );

      if (verb.banglaMeaning && verb.translationSourceHash === hash) {
        skipped += 1;
        continue;
      }

      tasks.push({
        kind: "verb",
        id: verb.id,
        text: verb.englishMeaning,
        hash,
      });
    }

    for (const conjugation of conjugations) {
      if (!conjugation.englishMeaning) {
        skipped += 1;
        continue;
      }

      const hash = this.libreTranslate.buildTranslationSourceHash(
        conjugation.englishMeaning,
      );

      if (
        conjugation.banglaMeaning &&
        conjugation.translationSourceHash === hash
      ) {
        skipped += 1;
        continue;
      }

      tasks.push({
        kind: "conjugation",
        id: conjugation.id,
        text: conjugation.englishMeaning,
        hash,
      });
    }

    for (const example of examples) {
      if (!example.englishText) {
        skipped += 1;
        continue;
      }

      const hash = this.libreTranslate.buildTranslationSourceHash(
        example.englishText,
      );

      if (example.banglaText && example.translationSourceHash === hash) {
        skipped += 1;
        continue;
      }

      tasks.push({
        kind: "example",
        id: example.id,
        text: example.englishText,
        hash,
      });
    }

    const translations = await this.libreTranslate.translateEnglishToBangla(
      tasks.map((task) => task.text),
    );

    let translated = 0;

    for (let index = 0; index < tasks.length; index += 1) {
      const task = tasks[index];
      const bangla = translations[index];

      if (!bangla) continue;

      if (task.kind === "verb") {
        await this.verbRepository.update(task.id, {
          banglaMeaning: bangla,
          translationSourceHash: task.hash,
        });
      } else if (task.kind === "conjugation") {
        await this.conjugationRepository.update(task.id, {
          banglaMeaning: bangla,
          translationSourceHash: task.hash,
        });
      } else {
        await this.exampleRepository.update(task.id, {
          banglaText: bangla,
          translationSourceHash: task.hash,
        });
      }

      translated += 1;
    }

    return {
      configured: 1,
      requested: tasks.length,
      translated,
      skipped,
    };
  }
}
