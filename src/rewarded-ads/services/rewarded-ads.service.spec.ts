/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/require-await */
import { generateKeyPairSync, sign } from 'crypto';
import { RewardedAdSession } from '../entities/rewarded-ad-session.entity';
import { RewardedUserState } from '../entities/rewarded-user-state.entity';
import {
  RewardedPlacement,
  RewardedSessionStatus,
} from '../types/rewarded-ad.type';
import { RewardedAdsService } from './rewarded-ads.service';

describe('RewardedAdsService', () => {
  const build = (
    storePurchase = false,
    environment: Record<string, string | undefined> = {},
    activeAdFreeSubscription = false,
  ) => {
    const state: RewardedUserState = {
      id: 'state-id',
      userId: 'user-id',
      counters: {},
      outgoingCallsUsed: 0,
      callCredits: 0,
      dailyBonusDate: null,
      dailyBonusCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const sessionRows: RewardedAdSession[] = [];
    let sessionSequence = 0;

    const sessionQuery = () => {
      const parameters: Record<string, unknown> = {};
      const query = {
        setLock: jest.fn(() => query),
        where: jest.fn((_sql: string, values?: Record<string, unknown>) => {
          Object.assign(parameters, values);
          return query;
        }),
        andWhere: jest.fn((_sql: string, values?: Record<string, unknown>) => {
          Object.assign(parameters, values);
          return query;
        }),
        orderBy: jest.fn(() => query),
        getOne: jest.fn(async () => {
          if (parameters.sessionId)
            return (
              sessionRows.find(
                (item) =>
                  item.id === parameters.sessionId &&
                  (!parameters.userId || item.userId === parameters.userId),
              ) ?? null
            );
          return (
            [...sessionRows]
              .reverse()
              .find(
                (item) =>
                  item.userId === parameters.userId &&
                  item.placement === parameters.placement &&
                  item.status === RewardedSessionStatus.PENDING &&
                  item.expiresAt > new Date() &&
                  item.canceledAt == null,
              ) ?? null
          );
        }),
      };
      return query;
    };

    const stateQuery = () => {
      const query = {
        setLock: jest.fn(() => query),
        where: jest.fn(() => query),
        getOne: jest.fn(async () => state),
      };
      return query;
    };

    const sessionRepository = {
      createQueryBuilder: jest.fn(sessionQuery),
      findOneBy: jest.fn(async (where: Partial<RewardedAdSession>) => {
        return (
          sessionRows.find((item) =>
            Object.entries(where).every(
              ([key, value]) => item[key as keyof RewardedAdSession] === value,
            ),
          ) ?? null
        );
      }),
    };
    const stateRepository = {
      createQueryBuilder: jest.fn(stateQuery),
    };

    const manager = {
      createQueryBuilder: jest.fn(() => {
        const insert = {
          insert: jest.fn(() => insert),
          into: jest.fn(() => insert),
          values: jest.fn(() => insert),
          orIgnore: jest.fn(() => insert),
          execute: jest.fn(async () => ({ identifiers: [] })),
        };
        return insert;
      }),
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RewardedAdSession) return sessionRepository;
        if (entity === RewardedUserState) return stateRepository;
        return {
          findOneBy: jest.fn(async () => null),
          increment: jest.fn(async () => undefined),
        };
      }),
      create: jest.fn((entity: unknown, value: Record<string, unknown>) => {
        if (entity !== RewardedAdSession) return value;
        sessionSequence += 1;
        return {
          id: `session-${sessionSequence}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...value,
        } as RewardedAdSession;
      }),
      save: jest.fn(async (value: RewardedAdSession | RewardedUserState) => {
        if ('placement' in value && !sessionRows.includes(value))
          sessionRows.push(value);
        return value;
      }),
    };

    let transactionQueue: Promise<unknown> = Promise.resolve();
    const dataSource = {
      transaction: jest.fn(
        <T>(callback: (value: typeof manager) => Promise<T>) => {
          const result = transactionQueue.then(() => callback(manager));
          transactionQueue = result.catch(() => undefined);
          return result;
        },
      ),
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
    };
    const sessions = {
      create: jest.fn((value: Record<string, unknown>) => {
        sessionSequence += 1;
        return {
          id: `session-${sessionSequence}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...value,
        } as RewardedAdSession;
      }),
      save: jest.fn(async (value: RewardedAdSession) => {
        if (!sessionRows.includes(value)) sessionRows.push(value);
        return value;
      }),
      findOneBy: sessionRepository.findOneBy,
    };
    const states = {
      findOneBy: jest.fn(async () => state),
      save: jest.fn(async (value: RewardedUserState) => value),
      create: jest.fn((value: Partial<RewardedUserState>) => value),
    };
    const service = new RewardedAdsService(
      { get: jest.fn((key: string) => environment[key]) } as never,
      dataSource as never,
      sessions as never,
      states as never,
      { exist: jest.fn(async () => storePurchase) } as never,
    );
    return { service, state, sessionRows };
  };

  async function advanceAndVerify(
    service: RewardedAdsService,
    opening: number,
  ) {
    const result = await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
      contextId: `verb-${opening}`,
    });
    if (result.required) {
      await service.markClientShown('user-id', result.sessionId);
      await service.markClientEarned('user-id', result.sessionId);
      await service.completeDevelopmentSession('user-id', result.sessionId);
    }
    return result;
  }

  it('requires verified ads on verb openings 3, 6, 9, and 12', async () => {
    const { service, state } = build(false, {
      NODE_ENV: 'test',
      REWARDED_VERB_INTERVAL: '3',
    });
    const required: number[] = [];
    for (let opening = 1; opening <= 12; opening += 1) {
      const result = await advanceAndVerify(service, opening);
      if (result.required) required.push(opening);
    }
    expect(required).toEqual([3, 6, 9, 12]);
    expect(state.counters.verb_detail).toBe(12);
  });

  it('does not let cancellation bypass a due verb ad', async () => {
    const { service, state } = build(false, { NODE_ENV: 'test' });
    await advanceAndVerify(service, 1);
    await advanceAndVerify(service, 2);
    const due = await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    expect(due.required).toBe(true);
    await service.cancelSession('user-id', due.sessionId);
    const retry = await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    expect(retry).toMatchObject({ required: true, resumed: false });
    expect(retry.sessionId).not.toBe(due.sessionId);
    expect(state.counters.verb_detail).toBe(2);
  });

  it('reuses an earned pending session while SSV is delayed', async () => {
    const { service, state, sessionRows } = build(false, { NODE_ENV: 'test' });
    await advanceAndVerify(service, 1);
    await advanceAndVerify(service, 2);
    const due = await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    await service.markClientShown('user-id', due.sessionId);
    await service.markClientEarned('user-id', due.sessionId);

    const resumed = await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    expect(resumed).toMatchObject({
      required: true,
      resumed: true,
      verificationPending: true,
      sessionId: due.sessionId,
    });
    expect(sessionRows).toHaveLength(1);
    expect(state.counters.verb_detail).toBe(2);

    await service.completeDevelopmentSession('user-id', due.sessionId);
    const next = await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    expect(next).toMatchObject({ required: false, count: 4 });
  });

  it('rejects debug completion in production without advancing cadence', async () => {
    const { service, state } = build(false, { NODE_ENV: 'production' });
    await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    const due = await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    await expect(
      service.completeDevelopmentSession('user-id', due.sessionId),
    ).rejects.toMatchObject({ status: 403 });
    expect(state.counters.verb_detail).toBe(2);
  });

  it('serializes concurrent due openings onto one pending session', async () => {
    const { service, sessionRows } = build(false, { NODE_ENV: 'test' });
    await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    const [first, second] = await Promise.all([
      service.createSession('user-id', {
        placement: RewardedPlacement.VERB_DETAIL,
      }),
      service.createSession('user-id', {
        placement: RewardedPlacement.VERB_DETAIL,
      }),
    ]);
    expect(first.sessionId).toBe(second.sessionId);
    expect(sessionRows).toHaveLength(1);
  });

  it('verifies signed SSV and makes duplicate callbacks idempotent', async () => {
    const { service, state } = build(false, { NODE_ENV: 'production' });
    await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    const due = await service.createSession('user-id', {
      placement: RewardedPlacement.VERB_DETAIL,
    });
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const signedData = `custom_data=${due.sessionId}&transaction_id=tx-1`;
    const signature = sign(
      'sha256',
      Buffer.from(signedData),
      privateKey,
    ).toString('base64url');
    (service as unknown as { ssvKeys: unknown }).ssvKeys = {
      expiresAt: Date.now() + 60_000,
      keys: [
        {
          keyId: 123,
          pem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
        },
      ],
    };
    const query = {
      custom_data: due.sessionId,
      transaction_id: 'tx-1',
      signature,
      key_id: '123',
    };
    const originalUrl = `/rewarded-ads/ssv?${signedData}&signature=${signature}&key_id=123`;

    await expect(
      service.handleSsvCallback(originalUrl, query),
    ).resolves.toEqual({
      granted: true,
      placement: RewardedPlacement.VERB_DETAIL,
    });
    await expect(
      service.handleSsvCallback(originalUrl, query),
    ).resolves.toEqual({ granted: true, duplicate: true });
    expect(state.counters.verb_detail).toBe(3);
  });

  it('bypasses all rewarded placements for a verified purchaser', async () => {
    const { service, sessionRows } = build(true);
    await expect(
      service.createSession('user-id', {
        placement: RewardedPlacement.VERB_DETAIL,
      }),
    ).resolves.toEqual({ required: false, reason: 'ad_free' });
    expect(sessionRows).toHaveLength(0);
  });

  it('marks an active Ad-Free subscription as ad-free', async () => {
    const { service } = build(false, {}, true);
    await expect(service.getConfiguration('user-id')).resolves.toMatchObject({
      isAdFree: true,
    });
  });

  it('keeps legacy outgoing calls unlimited until rollout is enabled', async () => {
    const { service, state } = build();
    state.outgoingCallsUsed = 10;
    await expect(
      service.assertOutgoingCallAvailable('user-id'),
    ).resolves.toBeUndefined();
  });

  it('returns safe native ad defaults', async () => {
    const { service } = build();
    await expect(service.getConfiguration('user-id')).resolves.toMatchObject({
      nativeAds: {
        enabled: true,
        placements: {
          freeVideoProgress: { enabled: true, progressPercent: 60 },
          courseCatalog: { enabled: true, firstAfter: 3 },
          careerSentences: { enabled: true, firstAfter: 3, interval: 4 },
        },
      },
    });
  });
});
