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
import { LeaderboardRewardContent } from './entities/leaderboard-reward-content.entity';
import { LeaderboardRewardValue } from './entities/leaderboard-reward-value.entity';
import { LeaderboardRewardFulfillment } from './entities/leaderboard-reward-fulfillment.entity';
import { LeaderboardRewardShippingAddress } from './entities/leaderboard-reward-shipping-address.entity';
import { LeaderboardRewardNotification } from './entities/leaderboard-reward-notification.entity';
import { LeaderboardRewardsController } from './controllers/leaderboard-rewards.controller';
import { AdminLeaderboardRewardsController } from './controllers/admin-leaderboard-rewards.controller';
import { LeaderboardRewardNotificationService } from './services/leaderboard-reward-notification.service';
import { LeaderboardRewardApplicationService } from './services/leaderboard-reward-application.service';
import { LeaderboardRewardService } from './services/leaderboard-reward.service';
import { AdminLeaderboardRewardService } from './services/admin-leaderboard-reward.service';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      LeagueDefinition,
      LeaderboardProfile,
      LeaderboardXpEvent,
      LeaguePromotionEvent,
      LeaderboardReward,
      LeaderboardRewardContent,
      LeaderboardRewardValue,
      LeaderboardRewardFulfillment,
      LeaderboardRewardShippingAddress,
      LeaderboardRewardNotification,
    ]),
    ScoringModule,
    NotificationsModule,
  ],
  controllers: [
    LeaderboardController,
    LeaderboardRewardsController,
    AdminLeaderboardController,
    AdminLeaderboardRewardsController,
  ],
  providers: [
    LeagueConfigService,
    LeaderboardProfileService,
    LeaderboardXpService,
    LeaderboardService,
    AdminLeaderboardService,

    LeaderboardRewardNotificationService,
    LeaderboardRewardApplicationService,
    LeaderboardRewardService,
    AdminLeaderboardRewardService,
  ],
  exports: [
    LeaderboardXpService,
    LeaderboardProfileService,
    LeaderboardRewardService,
  ],
})
export class LeaderboardModule {}
