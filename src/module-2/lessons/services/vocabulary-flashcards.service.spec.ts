import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';
import {
  VocabularyMasteryStatus,
  VocabularyReviewChoice,
} from '../entities/user-vocabulary-progress.entity';
import {
  VocabularyReviewMode,
  VocabularyReviewSessionStatus,
} from '../entities/vocabulary-review-session.entity';
import { VocabularyFlashcardsService } from './vocabulary-flashcards.service';

describe('VocabularyFlashcardsService daily challenge consistency', () => {
  const user = { id: 'user-id' };
  const session = {
    id: 'session-id',
    userId: user.id,
    lessonId: 'lesson-id',
    mode: VocabularyReviewMode.WEAK_REVIEW,
    status: VocabularyReviewSessionStatus.IN_PROGRESS,
    totalCards: 1,
    knownCount: 0,
    weakCount: 0,
    startedAt: new Date(),
    completedAt: null,
  };

  const createService = () => {
    const vocabularyRepository = {
      count: jest.fn().mockResolvedValue(1),
    };
    const progressRepository = {
      find: jest.fn(),
    };
    const sessionRepository = {
      findOne: jest.fn().mockResolvedValue({ ...session }),
      save: jest
        .fn()
        .mockImplementation((value: unknown) => Promise.resolve(value)),
    };
    const dailyChallengesService = {
      recordInternalActivity: jest.fn().mockResolvedValue(true),
    };

    const service = new VocabularyFlashcardsService(
      {} as never,
      vocabularyRepository as never,
      progressRepository as never,
      sessionRepository as never,
      {} as never,
      dailyChallengesService as never,
    );

    return {
      service,
      sessionRepository,
      dailyChallengesService,
    };
  };

  it('records only review activity before the session is completed', async () => {
    const { service, dailyChallengesService } = createService();

    await service.recordCardReview(
      session.id,
      'word-id',
      {
        choice: VocabularyReviewChoice.KNOWN,
        clientActivityDate: '2026-10-12',
      },
      user,
    );

    expect(dailyChallengesService.recordInternalActivity).toHaveBeenCalledTimes(
      1,
    );
    expect(dailyChallengesService.recordInternalActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: LearningActivityType.VOCABULARY_FLASHCARD_REVIEWED,
      }),
    );
  });

  it('clears a weak word without counting it as a newly learned word', async () => {
    const { service } = createService();
    const internals = service as unknown as {
      getProgressMap: jest.Mock;
      ensureVocabularyBelongsToLesson: jest.Mock;
      saveSessionItems: jest.Mock;
      updateVocabularyProgress: jest.Mock;
      recordVocabularyDailyActivities: jest.Mock;
      buildSummary: jest.Mock;
    };

    internals.getProgressMap = jest.fn().mockResolvedValue(
      new Map([
        [
          'word-id',
          {
            vocabularyId: 'word-id',
            masteryStatus: VocabularyMasteryStatus.WEAK,
          },
        ],
      ]),
    );
    internals.ensureVocabularyBelongsToLesson = jest
      .fn()
      .mockResolvedValue(null);
    internals.saveSessionItems = jest.fn().mockResolvedValue(null);
    internals.updateVocabularyProgress = jest.fn().mockResolvedValue(null);
    internals.recordVocabularyDailyActivities = jest
      .fn()
      .mockResolvedValue(null);
    internals.buildSummary = jest.fn().mockResolvedValue({});

    await service.completeSession(
      session.id,
      {
        knownVocabularyIds: ['word-id'],
        weakVocabularyIds: [],
        clientActivityDate: '2026-10-12',
      },
      user,
    );

    expect(internals.recordVocabularyDailyActivities).toHaveBeenCalledWith(
      expect.objectContaining({
        knownVocabularyIds: [],
        weakClearedVocabularyIds: ['word-id'],
      }),
    );
  });
});
