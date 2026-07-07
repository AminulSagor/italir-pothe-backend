import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { InternalInfluencerPaidOrderDto } from '../dto/influencer-hub.dto';
import { InfluencerHubService } from '../services/influencer-hub.service';

@Controller('api/internal/influencer-hub/orders')
export class InternalOrdersController {
  constructor(private readonly influencerHubService: InfluencerHubService) {}

  @Post('handle-paid')
  @HttpCode(200)
  handlePaid(@Body() dto: InternalInfluencerPaidOrderDto) {
    return this.influencerHubService.handlePaidOrder(dto);
  }
}
