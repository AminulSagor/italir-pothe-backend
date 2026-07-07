import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { ValidateInfluencerCouponDto } from '../dto/influencer-hub.dto';
import { InfluencerHubService } from '../services/influencer-hub.service';

@Controller('api/coupons')
export class PublicCouponsController {
  constructor(private readonly influencerHubService: InfluencerHubService) {}

  @Post('validate')
  @HttpCode(200)
  validateCoupon(@Body() dto: ValidateInfluencerCouponDto) {
    return this.influencerHubService.validateCoupon(dto);
  }
}
