import { Controller, Post, Body } from '@nestjs/common';

@Controller('api/internal/influencer-hub/orders')
export class InternalOrdersController {
  @Post('handle-paid')
  handlePaid(@Body() body: any) {
    return { success: true, message: 'Order processed for attribution.' };
  }
}
