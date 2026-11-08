import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoursePurchaseOrder } from 'src/module-2/course-commerce/entities/course-purchase-order.entity';
import { UserStoreWallet } from 'src/package-store/entities/user-store-wallet.entity';
import { User } from 'src/users/entities/user.entity';
import { RewardedAdsController } from './controllers/rewarded-ads.controller';
import { RewardedAdSession } from './entities/rewarded-ad-session.entity';
import { RewardedUserState } from './entities/rewarded-user-state.entity';
import { RewardedAdsService } from './services/rewarded-ads.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RewardedAdSession,
      RewardedUserState,
      CoursePurchaseOrder,
      UserStoreWallet,
      User,
    ]),
  ],
  controllers: [RewardedAdsController],
  providers: [RewardedAdsService],
  exports: [RewardedAdsService],
})
export class RewardedAdsModule {}
