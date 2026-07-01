import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import { CoursePurchaseOrder } from '../entities/course-purchase-order.entity';
import { CoursePaymentProvider } from '../types/course-commerce.type';

@Injectable()
export class DemoPaymentGatewayService {
  constructor(private readonly configService: ConfigService) {}

  buildCheckoutAction(order: CoursePurchaseOrder) {
    if (!order.providerSnapshot) {
      throw new ServiceUnavailableException(
        'Course order provider snapshot is missing.',
      );
    }

    const common = {
      mode: this.isDemoModeEnabled() ? 'development' : 'server',
      provider: order.providerSnapshot.provider,
      orderId: order.id,
      productId: order.providerSnapshot.productId,
      productType: order.providerSnapshot.productType,
      basePlanId: order.providerSnapshot.basePlanId,
      offerId: order.providerSnapshot.offerId,
    };

    if (order.providerSnapshot.provider === CoursePaymentProvider.GOOGLE_PLAY) {
      return {
        ...common,
        obfuscatedAccountId: createHash('sha256')
          .update(order.userId)
          .digest('hex')
          .slice(0, 64),
        confirmationEndpoint: `/course-commerce/orders/${order.id}/google-play/verify`,
      };
    }

    return {
      ...common,
      confirmationEndpoint: `/course-commerce/orders/${order.id}/app-store/verify`,
    };
  }

  isDemoModeEnabled(): boolean {
    const enabled =
      this.configService.get<string>('PAYMENTS_DEMO_MODE') === 'true';

    return (
      enabled && this.configService.get<string>('NODE_ENV') !== 'production'
    );
  }

  assertDemoModeEnabled(): void {
    if (!this.isDemoModeEnabled()) {
      throw new ServiceUnavailableException(
        'Development course payment verification is disabled.',
      );
    }
  }
}
