import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserStreak } from './entities/user-streak.entity';
import { XpTransaction } from './entities/xp-transaction.entity';
import { ScoringService } from './services/scoring.service';
import { StreakService } from './services/streak.service';
import { UserXpBoost } from './entities/user-xp-boost.entity';

@Module({
  imports: [TypeOrmModule.forFeature([XpTransaction, UserStreak, UserXpBoost])],
  providers: [ScoringService, StreakService],
  exports: [ScoringService, StreakService],
})
export class ScoringModule {}
