import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { Lesson, LessonStatus } from '../entities/lesson.entity';
import { LessonVocabulary } from '../entities/lesson-vocabulary.entity';
import {
  UserVocabularyProgress,
  VocabularyMasteryStatus,
  VocabularyReviewChoice,
} from '../entities/user-vocabulary-progress.entity';
import {
  VocabularyReviewMode,
  VocabularyReviewSession,
  VocabularyReviewSessionStatus,
} from '../entities/vocabulary-review-session.entity';
import { VocabularyReviewSessionItem } from '../entities/vocabulary-review-session-item.entity';
import {
  CompleteVocabularyReviewDto,
  CompleteWeakVocabularyReviewDto,
  StartVocabularyReviewSessionDto,
} from '../dto/vocabulary-flashcard.dto';
import {
  VocabularyFlashcardItem,
  VocabularyFlashcardListResponse,
  VocabularyReviewSessionResponse,
  VocabularyReviewSummaryResponse,
} from '../types/vocabulary-flashcard-response.type';
import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';

interface VocabularyRequestUser {
  id: string;
}

@Injectable()
export class VocabularyFlashcardsService {
  constructor(
    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,

    @InjectRepository(LessonVocabulary)
    private readonly vocabularyRepository: Repository<LessonVocabulary>,

    @InjectRepository(UserVocabularyProgress)
    private readonly progressRepository: Repository<UserVocabularyProgress>,

    @InjectRepository(VocabularyReviewSession)
    private readonly sessionRepository: Repository<VocabularyReviewSession>,

    @InjectRepository(VocabularyReviewSessionItem)
    private readonly sessionItemRepository: Repository<VocabularyReviewSessionItem>,

    private readonly dailyChallengesService: DailyChallengesService,
  ) {}

  async getLessonFlashcards(
    lessonId: string,
    user: VocabularyRequestUser,
  ): Promise<VocabularyFlashcardListResponse> {
    await this.ensurePublishedLessonExists(lessonId);

    const vocabularyItems = await this.findLessonVocabulary(lessonId);
    const progressMap = await this.getProgressMap(user.id, lessonId);

    const cards = vocabularyItems.map((item) =>
      this.buildFlashcardItem(item, progressMap.get(item.id)),
    );

    return {
      lessonId,
      totalCards: cards.length,
      cards,
    };
  }

  async startSession(
    lessonId: string,
    dto: StartVocabularyReviewSessionDto,
    user: VocabularyRequestUser,
  ): Promise<VocabularyReviewSessionResponse> {
    await this.ensurePublishedLessonExists(lessonId);

    const mode = dto.mode ?? VocabularyReviewMode.FULL_LESSON;
    const totalCards =
      mode === VocabularyReviewMode.WEAK_REVIEW
        ? await this.countWeakVocabulary(lessonId, user.id)
        : await this.vocabularyRepository.count({ where: { lessonId } });

    if (totalCards === 0) {
      throw new BadRequestException(
        mode === VocabularyReviewMode.WEAK_REVIEW
          ? 'No weak vocabulary found for review'
          : 'No vocabulary found for this lesson',
      );
    }

    const session = this.sessionRepository.create({
      userId: user.id,
      lessonId,
      mode,
      status: VocabularyReviewSessionStatus.IN_PROGRESS,
      totalCards,
      knownCount: 0,
      weakCount: 0,
      startedAt: new Date(),
      completedAt: null,
    });

    const savedSession = await this.sessionRepository.save(session);

    return this.buildSessionResponse(savedSession);
  }

  async completeSession(
    sessionId: string,
    dto: CompleteVocabularyReviewDto,
    user: VocabularyRequestUser,
  ): Promise<VocabularyReviewSummaryResponse> {
    const session = await this.getSessionForUser(sessionId, user.id);

    if (session.status !== VocabularyReviewSessionStatus.IN_PROGRESS) {
      return this.getSessionResult(session.id, user);
    }

    const vocabularyIds = this.mergeUniqueIds(
      dto.knownVocabularyIds,
      dto.weakVocabularyIds,
    );

    if (vocabularyIds.length !== session.totalCards) {
      throw new BadRequestException(
        'Submitted vocabulary count does not match the session total cards',
      );
    }

    await this.ensureVocabularyBelongsToLesson(vocabularyIds, session.lessonId);

    const knownSet = new Set(dto.knownVocabularyIds);
    const weakSet = new Set(dto.weakVocabularyIds);

    await this.saveSessionItems(session.id, vocabularyIds, knownSet, weakSet);
    await this.updateVocabularyProgress(
      user.id,
      session.lessonId,
      dto.knownVocabularyIds,
      dto.weakVocabularyIds,
    );

    session.status = VocabularyReviewSessionStatus.COMPLETED;
    session.knownCount = dto.knownVocabularyIds.length;
    session.weakCount = dto.weakVocabularyIds.length;
    session.completedAt = new Date();

    const savedSession = await this.sessionRepository.save(session);

    await this.recordVocabularyDailyActivities({
      userId: user.id,
      reviewedVocabularyIds: vocabularyIds,
      knownVocabularyIds: dto.knownVocabularyIds,
      weakClearedVocabularyIds: [],
      clientActivityDate: dto.clientActivityDate,
    });

    return this.buildSummary(savedSession);
  }

  async getWeakCards(
    sessionId: string,
    user: VocabularyRequestUser,
  ): Promise<VocabularyFlashcardListResponse> {
    const session = await this.getSessionForUser(sessionId, user.id, ['items']);

    const weakVocabularyIds = session.items
      .filter((item) => item.choice === VocabularyReviewChoice.STUDY_AGAIN)
      .map((item) => item.vocabularyId);

    if (weakVocabularyIds.length === 0) {
      return {
        lessonId: session.lessonId,
        totalCards: 0,
        cards: [],
      };
    }

    const vocabularyItems = await this.vocabularyRepository.find({
      where: {
        id: In(weakVocabularyIds),
        lessonId: session.lessonId,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });

    const progressMap = await this.getProgressMap(user.id, session.lessonId);

    return {
      lessonId: session.lessonId,
      totalCards: vocabularyItems.length,
      cards: vocabularyItems.map((item) =>
        this.buildFlashcardItem(item, progressMap.get(item.id)),
      ),
    };
  }

  async completeWeakReview(
    sessionId: string,
    dto: CompleteWeakVocabularyReviewDto,
    user: VocabularyRequestUser,
  ): Promise<VocabularyReviewSummaryResponse> {
    const sourceSession = await this.getSessionForUser(sessionId, user.id, [
      'items',
    ]);

    const sourceWeakIds = sourceSession.items
      .filter((item) => item.choice === VocabularyReviewChoice.STUDY_AGAIN)
      .map((item) => item.vocabularyId);

    if (sourceWeakIds.length === 0) {
      throw new BadRequestException('This session has no weak words to review');
    }

    const submittedIds = this.mergeUniqueIds(
      dto.knownVocabularyIds,
      dto.stillWeakVocabularyIds,
    );

    const sourceWeakSet = new Set(sourceWeakIds);
    const hasInvalidId = submittedIds.some((id) => !sourceWeakSet.has(id));

    if (hasInvalidId || submittedIds.length !== sourceWeakIds.length) {
      throw new BadRequestException(
        'Weak review must submit only the weak vocabulary from the source session',
      );
    }

    const weakReviewSession = this.sessionRepository.create({
      userId: user.id,
      lessonId: sourceSession.lessonId,
      mode: VocabularyReviewMode.WEAK_REVIEW,
      status: VocabularyReviewSessionStatus.COMPLETED,
      totalCards: submittedIds.length,
      knownCount: dto.knownVocabularyIds.length,
      weakCount: dto.stillWeakVocabularyIds.length,
      startedAt: new Date(),
      completedAt: new Date(),
    });

    const savedWeakReviewSession =
      await this.sessionRepository.save(weakReviewSession);

    const knownSet = new Set(dto.knownVocabularyIds);
    const weakSet = new Set(dto.stillWeakVocabularyIds);

    await this.saveSessionItems(
      savedWeakReviewSession.id,
      submittedIds,
      knownSet,
      weakSet,
    );

    await this.updateVocabularyProgress(
      user.id,
      sourceSession.lessonId,
      dto.knownVocabularyIds,
      dto.stillWeakVocabularyIds,
    );

    await this.recordVocabularyDailyActivities({
      userId: user.id,
      reviewedVocabularyIds: submittedIds,
      knownVocabularyIds: dto.knownVocabularyIds,
      weakClearedVocabularyIds: dto.knownVocabularyIds,
      clientActivityDate: dto.clientActivityDate,
    });

    return this.buildLessonProgressSummary(
      sourceSession.lessonId,
      savedWeakReviewSession.id,
      user.id,
    );
  }

  private async recordVocabularyDailyActivities(params: {
    userId: string;
    reviewedVocabularyIds: string[];
    knownVocabularyIds: string[];
    weakClearedVocabularyIds: string[];
    clientActivityDate?: string;
  }) {
    const activityDate = this.resolveActivityDate(params.clientActivityDate);

    await Promise.all([
      ...this.buildVocabularyActivityRequests({
        userId: params.userId,
        vocabularyIds: params.reviewedVocabularyIds,
        activityDate,
        activityType: LearningActivityType.VOCABULARY_FLASHCARD_REVIEWED,
        eventKey: 'reviewed',
      }),
      ...this.buildVocabularyActivityRequests({
        userId: params.userId,
        vocabularyIds: params.knownVocabularyIds,
        activityDate,
        activityType: LearningActivityType.VOCABULARY_WORD_LEARNED,
        eventKey: 'known',
      }),
      ...this.buildVocabularyActivityRequests({
        userId: params.userId,
        vocabularyIds: params.weakClearedVocabularyIds,
        activityDate,
        activityType: LearningActivityType.VOCABULARY_WEAK_WORD_CLEARED,
        eventKey: 'weak-cleared',
      }),
    ]);
  }

  private buildVocabularyActivityRequests(params: {
    userId: string;
    vocabularyIds: string[];
    activityDate: string;
    activityType: LearningActivityType;
    eventKey: string;
  }) {
    const uniqueVocabularyIds = [...new Set(params.vocabularyIds)];

    return uniqueVocabularyIds.map((vocabularyId) =>
      this.dailyChallengesService.recordInternalActivity({
        userId: params.userId,
        activityType: params.activityType,
        sourceId:
          `vocabulary:${vocabularyId}:${params.eventKey}:${params.activityDate}`,
        value: 1,
        clientActivityDate: params.activityDate,
      }),
    );
  }

  private resolveActivityDate(value?: string) {
    const datePrefix = value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    return datePrefix ?? new Date().toISOString().slice(0, 10);
  }

  async getSessionResult(
    sessionId: string,
    user: VocabularyRequestUser,
  ): Promise<VocabularyReviewSummaryResponse> {
    const session = await this.getSessionForUser(sessionId, user.id);

    if (session.status !== VocabularyReviewSessionStatus.COMPLETED) {
      throw new BadRequestException(
        'Vocabulary review session is not completed',
      );
    }

    return this.buildSummary(session);
  }

  private async ensurePublishedLessonExists(lessonId: string) {
    const lesson = await this.lessonRepository.findOne({
      where: {
        id: lessonId,
        status: LessonStatus.PUBLISHED,
      },
    });

    if (!lesson) {
      throw new NotFoundException('Published lesson not found');
    }

    return lesson;
  }

  private async findLessonVocabulary(lessonId: string) {
    return this.vocabularyRepository.find({
      where: { lessonId },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });
  }

  private async getSessionForUser(
    sessionId: string,
    userId: string,
    relations: string[] = [],
  ) {
    const session = await this.sessionRepository.findOne({
      where: {
        id: sessionId,
        userId,
      },
      relations,
    });

    if (!session) {
      throw new UnauthorizedException('Vocabulary review session not found');
    }

    return session;
  }

  private async ensureVocabularyBelongsToLesson(
    vocabularyIds: string[],
    lessonId: string,
  ) {
    const vocabularyCount = await this.vocabularyRepository.count({
      where: {
        id: In(vocabularyIds),
        lessonId,
      },
    });

    if (vocabularyCount !== vocabularyIds.length) {
      throw new BadRequestException(
        'Some vocabulary items do not belong to this lesson',
      );
    }
  }

  private async saveSessionItems(
    sessionId: string,
    vocabularyIds: string[],
    knownSet: Set<string>,
    weakSet: Set<string>,
  ) {
    await this.sessionItemRepository.delete({ sessionId });

    const now = new Date();

    const items = vocabularyIds.map((vocabularyId, index) => {
      const choice = knownSet.has(vocabularyId)
        ? VocabularyReviewChoice.KNOWN
        : VocabularyReviewChoice.STUDY_AGAIN;

      if (!knownSet.has(vocabularyId) && !weakSet.has(vocabularyId)) {
        throw new BadRequestException(
          'Every vocabulary item must be marked as known or study again',
        );
      }

      return this.sessionItemRepository.create({
        sessionId,
        vocabularyId,
        choice,
        sortOrder: index + 1,
        answeredAt: now,
      });
    });

    await this.sessionItemRepository.save(items);
  }

  private async updateVocabularyProgress(
    userId: string,
    lessonId: string,
    knownVocabularyIds: string[],
    weakVocabularyIds: string[],
  ) {
    const now = new Date();

    await Promise.all([
      ...knownVocabularyIds.map((vocabularyId) =>
        this.upsertProgress({
          userId,
          lessonId,
          vocabularyId,
          choice: VocabularyReviewChoice.KNOWN,
          reviewedAt: now,
        }),
      ),
      ...weakVocabularyIds.map((vocabularyId) =>
        this.upsertProgress({
          userId,
          lessonId,
          vocabularyId,
          choice: VocabularyReviewChoice.STUDY_AGAIN,
          reviewedAt: now,
        }),
      ),
    ]);
  }

  private async upsertProgress(params: {
    userId: string;
    lessonId: string;
    vocabularyId: string;
    choice: VocabularyReviewChoice;
    reviewedAt: Date;
  }) {
    const existingProgress = await this.progressRepository.findOne({
      where: {
        userId: params.userId,
        vocabularyId: params.vocabularyId,
      },
    });

    const isKnown = params.choice === VocabularyReviewChoice.KNOWN;

    if (!existingProgress) {
      const progress = this.progressRepository.create({
        userId: params.userId,
        lessonId: params.lessonId,
        vocabularyId: params.vocabularyId,
        knownCount: isKnown ? 1 : 0,
        studyAgainCount: isKnown ? 0 : 1,
        lastChoice: params.choice,
        masteryStatus: isKnown
          ? VocabularyMasteryStatus.KNOWN
          : VocabularyMasteryStatus.WEAK,
        lastReviewedAt: params.reviewedAt,
      });

      return this.progressRepository.save(progress);
    }

    existingProgress.knownCount += isKnown ? 1 : 0;
    existingProgress.studyAgainCount += isKnown ? 0 : 1;
    existingProgress.lastChoice = params.choice;
    existingProgress.masteryStatus = isKnown
      ? VocabularyMasteryStatus.KNOWN
      : VocabularyMasteryStatus.WEAK;
    existingProgress.lastReviewedAt = params.reviewedAt;

    return this.progressRepository.save(existingProgress);
  }

  private async buildSummary(
    session: VocabularyReviewSession,
  ): Promise<VocabularyReviewSummaryResponse> {
    const weakItems = await this.sessionItemRepository.find({
      where: {
        sessionId: session.id,
        choice: VocabularyReviewChoice.STUDY_AGAIN,
      },
      relations: ['vocabulary'],
      order: {
        sortOrder: 'ASC',
      },
    });

    const progressMap = await this.getProgressMap(
      session.userId,
      session.lessonId,
    );

    const weakWords = weakItems.map((item) =>
      this.buildFlashcardItem(
        item.vocabulary,
        progressMap.get(item.vocabularyId),
      ),
    );

    return {
      sessionId: session.id,
      lessonId: session.lessonId,
      totalReviewed: session.totalCards,
      knownCount: session.knownCount,
      weakCount: session.weakCount,
      weakWords,
      allKnown: session.weakCount === 0,
    };
  }

  private async buildLessonProgressSummary(
    lessonId: string,
    sessionId: string,
    userId: string,
  ): Promise<VocabularyReviewSummaryResponse> {
    const progressList = await this.progressRepository.find({
      where: {
        userId,
        lessonId,
      },
      relations: ['vocabulary'],
      order: {
        updatedAt: 'DESC',
      },
    });

    const weakProgress = progressList.filter(
      (progress) => progress.masteryStatus === VocabularyMasteryStatus.WEAK,
    );

    const knownCount = progressList.filter(
      (progress) =>
        progress.masteryStatus === VocabularyMasteryStatus.KNOWN ||
        progress.masteryStatus === VocabularyMasteryStatus.MASTERED,
    ).length;

    const weakWords = weakProgress.map((progress) =>
      this.buildFlashcardItem(progress.vocabulary, progress),
    );

    return {
      sessionId,
      lessonId,
      totalReviewed: progressList.length,
      knownCount,
      weakCount: weakWords.length,
      weakWords,
      allKnown: weakWords.length === 0,
    };
  }

  private async getProgressMap(userId: string, lessonId: string) {
    const progressList = await this.progressRepository.find({
      where: {
        userId,
        lessonId,
      },
    });

    return new Map(
      progressList.map((progress) => [progress.vocabularyId, progress]),
    );
  }

  private async countWeakVocabulary(lessonId: string, userId: string) {
    return this.progressRepository.count({
      where: {
        userId,
        lessonId,
        masteryStatus: VocabularyMasteryStatus.WEAK,
      },
    });
  }

  private buildFlashcardItem(
    vocabulary: LessonVocabulary,
    progress?: UserVocabularyProgress,
  ): VocabularyFlashcardItem {
    return {
      id: vocabulary.id,
      italianWord: vocabulary.italianWord,
      englishMeaning: vocabulary.englishMeaning,
      englishExample: vocabulary.englishExample,
      aiPronunciationFileId: vocabulary.aiPronunciationFileId,
      masteryStatus: progress?.masteryStatus ?? VocabularyMasteryStatus.NEW,
    };
  }

  private buildSessionResponse(
    session: VocabularyReviewSession,
  ): VocabularyReviewSessionResponse {
    return {
      id: session.id,
      lessonId: session.lessonId,
      mode: session.mode,
      status: session.status,
      totalCards: session.totalCards,
      knownCount: session.knownCount,
      weakCount: session.weakCount,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    };
  }

  private mergeUniqueIds(firstIds: string[], secondIds: string[]) {
    const mergedIds = [...firstIds, ...secondIds];
    return Array.from(new Set(mergedIds));
  }
}
