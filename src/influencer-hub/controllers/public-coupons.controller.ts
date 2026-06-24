import { Controller, Post, Body } from '@nestjs/common';

@Controller('api/coupons')
export class PublicCouponsController {
  @Post('validate')
  validateCoupon(@Body() body: any) {
    return {
      success: true,
      message: 'Coupon validation result.',
      data: {
        valid: true,
        couponCode: body?.couponCode ?? 'JANE10',
        discountPercentage: '10.0',
        discountAmount: '10.00',
        finalSubtotal: '90.00',
        partnerDisplayName: 'Jane Doe',
        reasonCode: null,
      },
    };
  }
}
