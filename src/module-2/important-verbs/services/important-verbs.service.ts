import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { DailyChallengesService } from "src/module-2/daily-challenges/services/daily-challenges.service";
import { LearningActivityType } from "src/module-2/daily-challenges/types/daily-challenge.type";
import {
  ImportantVerbListQueryDto,
  ImportantVerbSearchQueryDto,
} from "../dto/important-verb-query.dto";
import { ReviewImportantVerbDto } from "../dto/important-verb-progress.dto";
import { ImportantVerb } from "../entities/important-verb.entity";
import { UserImportantVerbProgress } from "../entities/user-important-verb-progress.entity";
import { UserSavedImportantVerb } from "../entities/user-saved-important-verb.entity";
import {
  ImportantVerbLanguage,
  ImportantVerbPersonKey,
} from "../types/important-verb.type";

@Injectable()
export class ImportantVerbsService {
  constructor(
    @InjectRepository(ImportantVerb)
    private readonly verbRepository: Repository<ImportantVerb>,

    @InjectRepository(UserSavedImportantVerb)
    private readonly savedVerbRepository: Repository<UserSavedImportantVerb>,

    @InjectRepository(UserImportantVerbProgress)
    private readonly progressRepository: Repository<UserImportantVerbProgress>,

    private readonly dailyChallengesService: DailyChallengesService,
  ) {}

  async findAll(params: {
    userId: string;
    query: ImportantVerbListQueryDto;
    savedOnly?: boolean;
  }) {
    const page = params.query.page ?? 1;
    const limit = params.query.limit ?? 20;

    const queryBuilder = this.verbRepository
      .createQueryBuilder("verb")
      .where("verb.isPublished = :isPublished", {
        isPublished: true,
      });

    if (params.savedOnly) {
      queryBuilder.innerJoin(
        UserSavedImportantVerb,
        "saved",
        "saved.verbId = verb.id AND saved.userId = :userId",
        { userId: params.userId },
      );
    }

    if (params.query.search?.trim()) {
      queryBuilder.andWhere(
        `(
          verb.infinitive ILIKE :search
          OR verb.englishMeaning ILIKE :search
          OR verb.banglaMeaning ILIKE :search
          OR verb.italianMeaning ILIKE :search
        )`,
        {
          search: `%${params.query.search.trim()}%`,
        },
      );
    }

    if (params.query.regularity) {
      queryBuilder.andWhere("verb.regularity = :regularity", {
        regularity: params.query.regularity,
      });
    }

    if (params.query.endingType) {
      queryBuilder.andWhere("verb.endingType = :endingType", {
        endingType: params.query.endingType,
      });
    }

    queryBuilder
      .orderBy("verb.frequencyRank", "ASC", "NULLS LAST")
      .addOrderBy("verb.sortOrder", "ASC")
      .addOrderBy("verb.infinitive", "ASC")
      .skip((page - 1) * limit)
      .take(limit);

    const [verbs, total] = await queryBuilder.getManyAndCount();
    const savedIds = await this.getSavedVerbIds(
      params.userId,
      verbs.map((verb) => verb.id),
    );

    return {
      items: verbs.map((verb) =>
        this.buildVerbSummary(
          verb,
          savedIds.has(verb.id),
          params.query.language,
        ),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async search(params: { userId: string; query: ImportantVerbSearchQueryDto }) {
    const result = await this.findAll({
      userId: params.userId,
      query: {
        page: 1,
        limit: params.query.limit,
        search: params.query.q,
        language: params.query.language,
      },
    });

    return {
      items: result.items,
    };
  }

  async findSaved(params: {
    userId: string;
    query: ImportantVerbListQueryDto;
  }) {
    return this.findAll({
      userId: params.userId,
      query: params.query,
      savedOnly: true,
    });
  }

  async findById(params: {
    userId: string;
    verbId: string;
    language: ImportantVerbLanguage;
  }) {
    const verb = await this.verbRepository.findOne({
      where: {
        id: params.verbId,
        isPublished: true,
      },
      relations: {
        forms: {
          conjugations: {
            examples: true,
          },
          examples: true,
        },
      },
    });

    if (!verb) {
      throw new NotFoundException("Important verb not found.");
    }

    const isSaved = await this.savedVerbRepository.exist({
      where: {
        userId: params.userId,
        verbId: verb.id,
      },
    });

    const forms = [...(verb.forms ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((form) => {
        const formExamples = form.examples ?? [];

        return {
          id: form.id,
          formKey: form.formKey,
          title: this.selectByLanguage(
            {
              en: form.titleEn,
              bn: form.titleBn,
              it: form.titleIt,
            },
            params.language,
          ),
          titleEn: form.titleEn,
          titleBn: form.titleBn,
          titleIt: form.titleIt,
          description: this.selectByLanguage(
            {
              en: form.descriptionEn,
              bn: form.descriptionBn,
              it: form.descriptionIt,
            },
            params.language,
          ),
          descriptionEn: form.descriptionEn,
          descriptionBn: form.descriptionBn,
          descriptionIt: form.descriptionIt,
          isCompound: form.isCompound,
          sortOrder: form.sortOrder,
          conjugations: [...(form.conjugations ?? [])]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((conjugation) => {
              const examples = [
                ...(conjugation.examples ?? []),
                ...formExamples.filter(
                  (example) =>
                    example.conjugationId === conjugation.id &&
                    !(conjugation.examples ?? []).some(
                      (existing) => existing.id === example.id,
                    ),
                ),
              ].sort((a, b) => a.sortOrder - b.sortOrder);

              return {
                id: conjugation.id,
                personKey: conjugation.personKey,
                pronoun: this.selectByLanguage(
                  {
                    en: conjugation.pronounEn,
                    bn: conjugation.pronounBn,
                    it: conjugation.pronounIt,
                  },
                  params.language,
                ),
                pronounIt: conjugation.pronounIt,
                pronounEn: conjugation.pronounEn,
                pronounBn: conjugation.pronounBn,
                conjugatedText: conjugation.conjugatedText,
                tts: {
                  locale: "it-IT",
                  text: conjugation.conjugatedText,
                },
                meaning: this.selectByLanguage(
                  {
                    en: conjugation.englishMeaning,
                    bn: conjugation.banglaMeaning ?? conjugation.englishMeaning,
                    it: conjugation.conjugatedText,
                  },
                  params.language,
                ),
                englishMeaning: conjugation.englishMeaning,
                banglaMeaning: conjugation.banglaMeaning,
                sortOrder: conjugation.sortOrder,
                examples: examples.map((example) => ({
                  id: example.id,
                  italianText: example.italianText,
                  tts: {
                    locale: "it-IT",
                    text: example.italianText,
                  },
                  englishText: example.englishText,
                  banglaText: example.banglaText,
                  displayText: this.selectByLanguage(
                    {
                      en: example.englishText,
                      bn: example.banglaText ?? example.englishText,
                      it: example.italianText,
                    },
                    params.language,
                  ),
                  source: example.source,
                  sourceReference: example.sourceReference,
                  sourceLicense: example.sourceLicense,
                })),
              };
            }),
        };
      });

    return {
      ...this.buildVerbSummary(verb, isSaved, params.language),
      title: verb.infinitive.toUpperCase(),
      tts: {
        locale: "it-IT",
        text: verb.infinitive,
      },
      information: {
        title: this.selectByLanguage(
          {
            en: "Verb Information",
            bn: "ক্রিয়ার তথ্য",
            it: "Informazioni sul verbo",
          },
          params.language,
        ),
        badges: [verb.regularity, verb.endingType, verb.auxiliary],
        description: this.buildInformationDescription(verb, params.language),
      },
      forms,
    };
  }

  async saveVerb(userId: string, verbId: string) {
    await this.ensureVerbExists(verbId);

    await this.savedVerbRepository.upsert({ userId, verbId }, [
      "userId",
      "verbId",
    ]);

    return {
      message: "Important verb saved successfully.",
      verbId,
      isSaved: true,
    };
  }

  async removeSavedVerb(userId: string, verbId: string) {
    await this.savedVerbRepository.delete({
      userId,
      verbId,
    });

    return {
      message: "Important verb removed from saved list.",
      verbId,
      isSaved: false,
    };
  }

  async reviewVerb(params: {
    userId: string;
    verbId: string;
    dto: ReviewImportantVerbDto;
  }) {
    await this.ensureVerbExists(params.verbId);

    let progress = await this.progressRepository.findOne({
      where: {
        userId: params.userId,
        verbId: params.verbId,
      },
    });

    if (!progress) {
      progress = this.progressRepository.create({
        userId: params.userId,
        verbId: params.verbId,
        reviewCount: 1,
        lastReviewedAt: new Date(),
      });
    } else {
      progress.reviewCount += 1;
      progress.lastReviewedAt = new Date();
    }

    const savedProgress = await this.progressRepository.save(progress);

    await this.dailyChallengesService.recordInternalActivity({
      userId: params.userId,
      activityType: LearningActivityType.IMPORTANT_VERB_REVIEWED,
      sourceId: `important-verb:${params.verbId}:review:${savedProgress.reviewCount}`,
      value: 1,
      clientActivityDate: params.dto.clientActivityDate,
    });

    return {
      message: "Important verb reviewed successfully.",
      progress: savedProgress,
    };
  }

  async getMyProgress(userId: string) {
    const progressRows = await this.progressRepository.find({
      where: {
        userId,
      },
      order: {
        lastReviewedAt: "DESC",
      },
    });

    const verbs = progressRows.length
      ? await this.verbRepository.find({
          where: {
            id: In(progressRows.map((row) => row.verbId)),
          },
        })
      : [];

    const verbsById = new Map(verbs.map((verb) => [verb.id, verb]));

    return {
      totalReviewedVerbs: progressRows.length,
      totalReviews: progressRows.reduce((sum, row) => sum + row.reviewCount, 0),
      items: progressRows.map((row) => {
        const verb = verbsById.get(row.verbId);

        return {
          ...row,
          verb: verb
            ? this.buildVerbSummary(verb, false, ImportantVerbLanguage.ENGLISH)
            : null,
        };
      }),
    };
  }

  private async ensureVerbExists(verbId: string) {
    const exists = await this.verbRepository.exist({
      where: {
        id: verbId,
        isPublished: true,
      },
    });

    if (!exists) {
      throw new NotFoundException("Important verb not found.");
    }
  }

  private async getSavedVerbIds(userId: string, verbIds: string[]) {
    if (verbIds.length === 0) {
      return new Set<string>();
    }

    const rows = await this.savedVerbRepository.find({
      where: {
        userId,
        verbId: In(verbIds),
      },
      select: {
        verbId: true,
      },
    });

    return new Set(rows.map((row) => row.verbId));
  }

  private buildVerbSummary(
    verb: ImportantVerb,
    isSaved: boolean,
    language: ImportantVerbLanguage,
  ) {
    return {
      id: verb.id,
      infinitive: verb.infinitive,
      slug: verb.slug,
      englishMeaning: verb.englishMeaning,
      banglaMeaning: verb.banglaMeaning,
      italianMeaning: verb.italianMeaning,
      displayMeaning: this.selectByLanguage(
        {
          en: verb.englishMeaning,
          bn: verb.banglaMeaning ?? verb.englishMeaning,
          it: verb.italianMeaning ?? verb.englishMeaning,
        },
        language,
      ),
      regularity: verb.regularity,
      endingType: verb.endingType,
      auxiliary: verb.auxiliary,
      badges: [verb.regularity, verb.endingType],
      localizedBadges: this.buildLocalizedBadgeLabels(verb, language).slice(
        0,
        2,
      ),
      combinedMeaning: [verb.englishMeaning, verb.banglaMeaning]
        .filter(Boolean)
        .join(" / "),
      tts: {
        locale: "it-IT",
        text: verb.infinitive,
      },
      isSaved,
    };
  }

  private buildLocalizedBadgeLabels(
    verb: ImportantVerb,
    language: ImportantVerbLanguage,
  ) {
    const regularity = {
      en: verb.regularity === "regular" ? "Regular Verb" : "Irregular Verb",
      bn: verb.regularity === "regular" ? "নিয়মিত ক্রিয়া" : "অনিয়মিত ক্রিয়া",
      it: verb.regularity === "regular" ? "Verbo regolare" : "Verbo irregolare",
    };
    const ending = {
      en: `${verb.endingType.toUpperCase()} Verb`,
      bn: `${verb.endingType.toUpperCase()} ক্রিয়া`,
      it: `Verbo in ${verb.endingType}`,
    };
    const auxiliary = {
      en: `Auxiliary: ${verb.auxiliary}`,
      bn: `সহায়ক ক্রিয়া: ${verb.auxiliary}`,
      it: `Ausiliare: ${verb.auxiliary}`,
    };

    return [
      this.selectByLanguage(regularity, language),
      this.selectByLanguage(ending, language),
      this.selectByLanguage(auxiliary, language),
    ];
  }

  private buildInformationDescription(
    verb: ImportantVerb,
    language: ImportantVerbLanguage,
  ) {
    const descriptions = {
      en: `A ${verb.regularity} ${verb.endingType} Italian verb. It normally uses ${verb.auxiliary} in compound tenses.`,
      bn: `এটি একটি ${verb.regularity === "regular" ? "নিয়মিত" : "অনিয়মিত"} ${verb.endingType} ইতালীয় ক্রিয়া। যৌগিক কালে সাধারণত ${verb.auxiliary} ব্যবহৃত হয়।`,
      it: `Un verbo italiano ${verb.regularity === "regular" ? "regolare" : "irregolare"} in ${verb.endingType}. Nei tempi composti usa normalmente ${verb.auxiliary}.`,
    };

    return descriptions[language];
  }

  private selectByLanguage(
    value: {
      en: string | null | undefined;
      bn: string | null | undefined;
      it: string | null | undefined;
    },
    language: ImportantVerbLanguage,
  ) {
    return value[language] ?? value.en ?? value.it ?? value.bn ?? null;
  }
}
