import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Course } from 'src/module-2/courses/entities/course.entity';
import { StorePackageCommerce } from 'src/package-store/entities/store-package-commerce.entity';
import { StorePackage } from 'src/package-store/entities/store-package.entity';
import { AdminInfluencersController } from './controllers/admin-influencers.controller';
import { InternalOrdersController } from './controllers/internal-orders.controller';
import { PublicCouponsController } from './controllers/public-coupons.controller';
import { InfluencerCouponProviderMapping } from './entities/influencer-coupon-provider-mapping.entity';
import { InfluencerCoupon } from './entities/influencer-coupon.entity';
import { InfluencerLedgerEntry } from './entities/influencer-ledger-entry.entity';
import { InfluencerOrderAttribution } from './entities/influencer-order-attribution.entity';
import { InfluencerPartner } from './entities/influencer-partner.entity';
import { InfluencerSocialHandle } from './entities/influencer-social-handle.entity';
import { InfluencerHubService } from './services/influencer-hub.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      InfluencerPartner,
      InfluencerSocialHandle,
      InfluencerCoupon,
      InfluencerCouponProviderMapping,
      InfluencerOrderAttribution,
      InfluencerLedgerEntry,
      Course,
      StorePackage,
      StorePackageCommerce,
    ]),
  ],
  controllers: [
    AdminInfluencersController,
    PublicCouponsController,
    InternalOrdersController,
  ],
  providers: [InfluencerHubService],
  exports: [InfluencerHubService],
})
export class InfluencerHubModule {}
