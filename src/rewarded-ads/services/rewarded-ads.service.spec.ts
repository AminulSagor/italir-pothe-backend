import { RewardedAdsService } from './rewarded-ads.service';
import { RewardedPlacement } from '../types/rewarded-ad.type';

describe('RewardedAdsService', () => {
  const build = (
    storePurchase = false,
    environment: Record<string, string | undefined> = {},
    activeAdFreeSubscription = false,
  ) => {
    const state = {
      id: 'state-id',
      userId: 'user-id',
      counters: {} as Record<string, number>,
      outgoingCallsUsed: 0,
      callCredits: 0,
      dailyBonusDate: null,
      dailyBonusCount: 0,
    };
    const sessions = {
      create: jest.fn((value) => ({ id: 'session-id', ...value })),
      save: jest.fn(async (value) => value),
    };
    const states = {
      findOneBy: jest.fn(async () => state),
      save: jest.fn(async (value) => value),
      create: jest.fn((value) => value),
    };
    const service = new RewardedAdsService(
      { get: jest.fn((key: string) => environment[key]) } as never,
      {
        getRepository: jest.fn(() => ({
          createQueryBuilder: jest.fn(() => {
            const query = {
              innerJoin: jest.fn(() => query),
              where: jest.fn(() => query),
              andWhere: jest.fn(() => query),
              getExists: jest.fn(async () => activeAdFreeSubscription),
            };
            return query;
          }),
        })),
      } as never,
      sessions as never,
      states as never,
      { exist: jest.fn(async () => storePurchase) } as never,
    );
    return { service, state, sessions };
  };

  it('requires the third career module action with the default interval', async () => {
    const { service, state } = build();
    await expect(
      service.createSession('user-id', {
        placement: RewardedPlacement.CAREER_MODULE,
      }),
    ).resolves.toMatchObject({ required: false, count: 1 });
    await expect(
      service.createSession('user-id', {
        placement: RewardedPlacement.CAREER_MODULE,
      }),
    ).resolves.toMatchObject({ required: false, count: 2 });
    await expect(
      service.createSession('user-id', {
        placement: RewardedPlacement.CAREER_MODULE,
      }),
    ).resolves.toMatchObject({ required: true, sessionId: 'session-id' });
    expect(state.counters.career_module).toBe(2);
  });

  it('bypasses all rewarded placements for a verified purchaser', async () => {
    const { service, sessions } = build(true);
    await expect(
      service.createSession('user-id', {
        placement: RewardedPlacement.DAILY_CHEST,
      }),
    ).resolves.toEqual({ required: false, reason: 'ad_free' });
    expect(sessions.save).not.toHaveBeenCalled();
  });

  it('marks an active Ad-Free subscription as ad-free', async () => {
    const { service } = build(false, {}, true);
    await expect(service.getConfiguration('user-id')).resolves.toMatchObject({
      isAdFree: true,
    });
  });

  it('keeps legacy outgoing calls unlimited until the rollout flag is enabled', async () => {
    const { service, state } = build();
    state.outgoingCallsUsed = 10;
    await expect(
      service.assertOutgoingCallAvailable('user-id'),
    ).resolves.toBeUndefined();
  });

  it('enforces outgoing call credits after the rollout flag is enabled', async () => {
    const { service, state } = build(false, {
      REWARDED_CALL_LIMIT_ENABLED: 'true',
    });
    state.outgoingCallsUsed = 1;
    await expect(
      service.assertOutgoingCallAvailable('user-id'),
    ).rejects.toMatchObject({
      status: 402,
    });
  });

  it('returns safe default native ad placement configuration', async () => {
    const { service } = build();
    await expect(service.getConfiguration('user-id')).resolves.toMatchObject({
      nativeAds: {
        enabled: true,
        placements: {
          freeVideoProgress: { enabled: true, progressPercent: 60 },
          courseCatalog: { enabled: true, firstAfter: 3 },
          careerSentences: { enabled: true, firstAfter: 3, interval: 4 },
          messages: { enabled: true, firstAfter: 3, interval: 4 },
        },
      },
    });
  });

  it('falls back when native numeric environment values are invalid', async () => {
    const { service } = build(false, {
      NATIVE_VIDEO_PROGRESS_PERCENT: '100',
      NATIVE_COURSE_CATALOG_FIRST_AFTER: '-2',
      NATIVE_CAREER_SENTENCES_FIRST_AFTER: '-2',
      NATIVE_CAREER_SENTENCES_INTERVAL: '-2',
    });

    await expect(service.getConfiguration('user-id')).resolves.toMatchObject({
      nativeAds: {
        placements: {
          freeVideoProgress: { progressPercent: 60 },
          courseCatalog: { firstAfter: 3 },
          careerSentences: { firstAfter: 3, interval: 4 },
        },
      },
    });
  });
});
