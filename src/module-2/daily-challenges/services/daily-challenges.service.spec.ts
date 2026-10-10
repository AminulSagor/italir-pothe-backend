import {
  DailyChallengeTaskKey,
  LearningActivityType,
} from '../types/daily-challenge.type';
import { DailyChallengesService } from './daily-challenges.service';
import { DailyChallengeProgressStatus } from '../entities/user-daily-challenge-progress.entity';

describe('DailyChallengesService tracking rules', () => {
  const createService = (
    progressRepository: Record<string, unknown> = {},
    xpRepository: Record<string, unknown> = {},
    learningTimeRepository: Record<string, unknown> = {},
  ) =>
    new DailyChallengesService(
      {} as never,
      {} as never,
      progressRepository as never,
      {} as never,
      {} as never,
      xpRepository as never,
      learningTimeRepository as never,
      {} as never,
      {} as never,
      {} as never,
    );

  it('does not count generic quiz/lesson audio as Practice Hub audio', () => {
    const service = createService();
    const generic = (
      service as unknown as {
        mapActivityToTaskUpdates: (dto: object) => { taskKey: string }[];
      }
    ).mapActivityToTaskUpdates({
      activityType: LearningActivityType.AUDIO_TRACK_LISTENED,
      value: 1,
    });
    const hub = (
      service as unknown as {
        mapActivityToTaskUpdates: (dto: object) => { taskKey: string }[];
      }
    ).mapActivityToTaskUpdates({
      activityType: LearningActivityType.AUDIO_TRACK_LISTENED,
      value: 1,
      metadata: { scope: 'practice_hub' },
    });

    expect(generic.map((item) => item.taskKey)).toEqual([
      DailyChallengeTaskKey.LISTEN_AUDIO_TRACKS,
    ]);
    expect(hub.map((item) => item.taskKey)).toEqual([
      DailyChallengeTaskKey.LISTEN_TRACKS_HUB,
    ]);
  });

  it('counts only a first Important Verb review as learning a new verb', () => {
    const service = createService();
    const map = (firstReview: boolean) =>
      (
        service as unknown as {
          mapActivityToTaskUpdates: (dto: object) => { taskKey: string }[];
        }
      ).mapActivityToTaskUpdates({
        activityType: LearningActivityType.IMPORTANT_VERB_REVIEWED,
        value: 1,
        metadata: { firstReview },
      });

    expect(map(false).map((item) => item.taskKey)).toEqual([
      DailyChallengeTaskKey.REVIEW_IMPORTANT_VERB,
    ]);
    expect(map(true).map((item) => item.taskKey)).toContain(
      DailyChallengeTaskKey.LEARN_VERBS,
    );
  });

  it('locks the progress row before incrementing it', async () => {
    const progress = {
      userId: 'user-1',
      challengeDate: '2026-09-28',
      taskKey: DailyChallengeTaskKey.REVIEW_VOCAB_WORDS,
      progressValue: 19,
      targetValue: 20,
      status: DailyChallengeProgressStatus.IN_PROGRESS,
      completedAt: null as Date | null,
    };
    const transactionalRepository = {
      findOne: jest.fn().mockResolvedValue(progress),
      save: jest.fn().mockResolvedValue(progress),
    };
    const progressRepository = {
      manager: {
        transaction: jest.fn((callback: (manager: object) => unknown) =>
          Promise.resolve(
            callback({ getRepository: () => transactionalRepository }),
          ),
        ),
      },
    };
    const service = createService(progressRepository);

    await (
      service as unknown as {
        incrementTaskProgress: (
          userId: string,
          date: string,
          key: DailyChallengeTaskKey,
          value: number,
        ) => Promise<void>;
      }
    ).incrementTaskProgress(
      'user-1',
      '2026-09-28',
      DailyChallengeTaskKey.REVIEW_VOCAB_WORDS,
      1,
    );

    expect(transactionalRepository.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(progress.progressValue).toBe(20);
    expect(progress.status).toBe(DailyChallengeProgressStatus.COMPLETED);
    expect(transactionalRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does not add legacy minute progress when authoritative timer data exists', async () => {
    const service = createService(
      {},
      { count: jest.fn().mockResolvedValue(0) },
      { count: jest.fn().mockResolvedValue(1) },
    );
    const updates = await (
      service as unknown as {
        removeDerivedFallbackUpdates: (
          userId: string,
          date: string,
          updates: { taskKey: DailyChallengeTaskKey; value: number }[],
        ) => Promise<{ taskKey: DailyChallengeTaskKey; value: number }[]>;
      }
    ).removeDerivedFallbackUpdates('user-1', '2026-09-28', [
      {
        taskKey: DailyChallengeTaskKey.ACTIVE_LEARNING_MINUTES,
        value: 5,
      },
      { taskKey: DailyChallengeTaskKey.READ_THEORY_PAGE, value: 1 },
    ]);

    expect(updates).toEqual([
      { taskKey: DailyChallengeTaskKey.READ_THEORY_PAGE, value: 1 },
    ]);
  });

  it('presents the current Listening MCQ title for existing challenge rows', () => {
    const service = createService();
    const tasks = (
      service as unknown as {
        applyCurrentTaskTitles: (
          items: object[],
          variationKey: string,
        ) => { title: string }[];
      }
    ).applyCurrentTaskTitles(
      [
        {
          taskKey: DailyChallengeTaskKey.LISTENING_MCQ_CORRECT,
          title: 'Get 3 “True/False” Audio Questions Correct',
        },
      ],
      'daily_challenge_variation_06',
    );

    expect(tasks[0].title).toBe('Answer 3 “Listening MCQ” Questions Correctly');
  });
});
