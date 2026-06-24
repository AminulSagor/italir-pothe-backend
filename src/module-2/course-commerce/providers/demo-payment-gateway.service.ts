import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

import {
  ConfirmGooglePlayDemoDto,
  ConfirmStripeDemoDto,
} from '../dto/course-commerce.dto';
import { CoursePurchaseOrder } from '../entities/course-purchase-order.entity';
import { CoursePaymentProvider } from '../types/course-commerce.type';

export interface DemoPaymentConfirmation {
  succeeded: boolean;
  providerReference: string;
  failureCode: string | null;
  failureMessage: string | null;
}

@Injectable()
export class DemoPaymentGatewayService {
  constructor(private readonly configService: ConfigService) {}

  buildCheckoutAction(order: CoursePurchaseOrder) {
    this.assertDemoModeEnabled();

    if (order.paymentProvider === CoursePaymentProvider.GOOGLE_PLAY) {
      return {
        mode: 'demo',
        provider: CoursePaymentProvider.GOOGLE_PLAY,
        orderId: order.id,
        productId: this.getGooglePlayProductId(order),
        obfuscatedAccountId: createHash('sha256')
          .update(order.userId)
          .digest('hex')
          .slice(0, 64),
        confirmationEndpoint: `/course-purchases/orders/${order.id}/google-play/demo-confirm`,
      };
    }

    const paymentIntentId = this.getStripePaymentIntentId(order.id);

    return {
      mode: 'demo',
      provider: CoursePaymentProvider.STRIPE,
      orderId: order.id,
      paymentIntentId,
      clientSecret: `${paymentIntentId}_secret_demo`,
      confirmationEndpoint: `/course-purchases/orders/${order.id}/stripe/demo-confirm`,
    };
  }

  confirmGooglePlay(params: {
    order: CoursePurchaseOrder;
    dto: ConfirmGooglePlayDemoDto;
  }): DemoPaymentConfirmation {
    this.assertDemoModeEnabled();

    const expectedProductId = this.getGooglePlayProductId(params.order);

    if (params.dto.productId !== expectedProductId) {
      throw new BadRequestException(
        'Google Play product ID does not match this purchase order.',
      );
    }

    if (!params.dto.purchaseToken.startsWith('demo_gplay_')) {
      return {
        succeeded: false,
        providerReference: params.dto.purchaseToken,
        failureCode: 'invalid_demo_token',
        failureMessage:
          'Demo Google Play purchase token must start with demo_gplay_.',
      };
    }

    return {
      succeeded: true,
      providerReference: params.dto.purchaseToken,
      failureCode: null,
      failureMessage: null,
    };
  }

  confirmStripe(params: {
    order: CoursePurchaseOrder;
    dto: ConfirmStripeDemoDto;
  }): DemoPaymentConfirmation {
    this.assertDemoModeEnabled();

    const expectedPaymentIntentId = this.getStripePaymentIntentId(
      params.order.id,
    );

    if (params.dto.paymentIntentId !== expectedPaymentIntentId) {
      throw new BadRequestException(
        'Stripe PaymentIntent does not match this purchase order.',
      );
    }

    if (params.dto.demoResult === 'failed') {
      return {
        succeeded: false,
        providerReference: params.dto.paymentIntentId,
        failureCode: 'demo_card_declined',
        failureMessage: 'The demo Stripe payment was declined.',
      };
    }

    return {
      succeeded: true,
      providerReference: params.dto.paymentIntentId,
      failureCode: null,
      failureMessage: null,
    };
  }

  getGooglePlayProductId(order: CoursePurchaseOrder): string {
    const prefix =
      this.configService.get<string>('GOOGLE_PLAY_DEMO_PRODUCT_PREFIX') ??
      'demo';

    return [
      prefix,
      order.courseId.replace(/-/g, ''),
      order.paymentCurrency.toLowerCase(),
    ].join('_');
  }

  getStripePaymentIntentId(orderId: string): string {
    return `pi_demo_${orderId.replace(/-/g, '')}`;
  }

  assertDemoModeEnabled(): void {
    const enabled =
      this.configService.get<string>('PAYMENTS_DEMO_MODE') === 'true';

    if (!enabled) {
      throw new ServiceUnavailableException('Demo payment mode is disabled.');
    }
  }
}
