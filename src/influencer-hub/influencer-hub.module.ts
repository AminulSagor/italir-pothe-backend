import { Module } from '@nestjs/common';
import { AdminInfluencersController } from './controllers/admin-influencers.controller';
import { PublicCouponsController } from './controllers/public-coupons.controller';
import { InternalOrdersController } from './controllers/internal-orders.controller';

@Module({
  controllers: [AdminInfluencersController, PublicCouponsController, InternalOrdersController],
})
export class InfluencerHubModule {}
