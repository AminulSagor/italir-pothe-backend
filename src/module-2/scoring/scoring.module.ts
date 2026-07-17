import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { StoreSubscription } from 'src/billing/google-play-subscriptions/entities/store-subscription.entity';
import { StoreOrderPackageSnapshot } from 'src/package-store/entities/store-order-package-snapshot.entity';

import { UserStreak } from './entities/user-streak.entity';
import { UserXpBoost } from './entities/user-xp-boost.entity';
import { XpTransaction } from './entities/xp-transaction.entity';
import { ScoringService } from './services/scoring.service';
import { StreakService } from './services/streak.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      XpTransaction,
      UserStreak,
      UserXpBoost,

      // Required for historical monthly-protection checks.
      StoreSubscription,
      StoreOrderPackageSnapshot,
    ]),
  ],
  providers: [ScoringService, StreakService],
  exports: [ScoringService, StreakService],
})
export class ScoringModule {}
