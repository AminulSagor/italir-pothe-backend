import { Module } from '@nestjs/common';

import { RevenueAnalyticsController } from './revenue-analytics.controller';
import { RevenueAnalyticsService } from './revenue-analytics.service';

@Module({
  controllers: [RevenueAnalyticsController],

  providers: [RevenueAnalyticsService],

  exports: [RevenueAnalyticsService],
})
export class RevenueAnalyticsModule {}
