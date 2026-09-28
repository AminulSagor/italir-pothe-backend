import { Repository } from 'typeorm';

import { StoreSubscription } from 'src/billing/google-play-subscriptions/entities/store-subscription.entity';

import { UserStreak } from '../entities/user-streak.entity';
import { StreakService } from './streak.service';

describe('StreakService', () => {
  const userId = '00000000-0000-4000-8000-000000000001';

  function createService(streak: UserStreak) {
    const streakRepository = {
      findOne: jest.fn().mockResolvedValue(streak),
      save: jest.fn(async (value: UserStreak) => value),
    } as unknown as Repository<UserStreak>;

    const subscriptionRepository = {} as Repository<StoreSubscription>;

    return {
      service: new StreakService(streakRepository, subscriptionRepository),
      streakRepository,
    };
  }

  it('uses the calendar-date prefix from an ISO activity timestamp', async () => {
    const streak = {
      userId,
      currentDays: 4,
      longestDays: 4,
      lastActivityDate: '2026-09-27',
      lastActivityAt: new Date('2026-09-27T12:00:00.000Z'),
      streakFreezeCount: 0,
    } as UserStreak;
    const { service } = createService(streak);

    const summary = await service.updateDailyStreak(
      userId,
      '2026-09-28T01:30:00.000+06:00',
    );

    expect(summary.currentDays).toBe(5);
    expect(summary.lastActivityDate).toBe('2026-09-28');
    expect(summary.isUpdatedToday).toBe(true);
  });
});
