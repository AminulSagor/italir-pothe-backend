import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from 'src/users/entities/user.entity';
import { ScoringModule } from '../scoring/scoring.module';
import { AdminLeaderboardController } from './controllers/admin-leaderboard.controller';
import { LeaderboardController } from './controllers/leaderboard.controller';
import { LeagueDefinition } from './entities/league-definition.entity';
import { LeaguePromotionEvent } from './entities/league-promotion-event.entity';
import { LeaderboardProfile } from './entities/leaderboard-profile.entity';
import { LeaderboardReward } from './entities/leaderboard-reward.entity';
import { LeaderboardXpEvent } from './entities/leaderboard-xp-event.entity';
import { AdminLeaderboardService } from './services/admin-leaderboard.service';
import { LeagueConfigService } from './services/league-config.service';
import { LeaderboardProfileService } from './services/leaderboard-profile.service';
import { LeaderboardXpService } from './services/leaderboard-xp.service';
import { LeaderboardService } from './services/leaderboard.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      LeagueDefinition,
      LeaderboardProfile,
      LeaderboardXpEvent,
      LeaguePromotionEvent,
      LeaderboardReward,
    ]),
    ScoringModule,
  ],
  controllers: [LeaderboardController, AdminLeaderboardController],
  providers: [
    LeagueConfigService,
    LeaderboardProfileService,
    LeaderboardXpService,
    LeaderboardService,
    AdminLeaderboardService,
  ],
  exports: [LeaderboardXpService, LeaderboardProfileService],
})
export class LeaderboardModule {}
