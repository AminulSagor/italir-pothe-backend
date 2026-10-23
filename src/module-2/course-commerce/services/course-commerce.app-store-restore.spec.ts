import { ConflictException } from '@nestjs/common';
import { Environment, Type } from '@apple/app-store-server-library';

import { CourseCommerceService } from './course-commerce.service';

describe('CourseCommerceService App Store restore ownership', () => {
  it('returns an explicit conflict after Apple verifies another user order', async () => {
    const originalOrderId = '123e4567-e89b-42d3-a456-426614174000';
    const service = Object.create(
      CourseCommerceService.prototype,
    ) as CourseCommerceService;

    Object.assign(service, {
      appStoreBillingService: {
        verifyTransaction: jest.fn().mockResolvedValue({
          appAccountToken: originalOrderId,
          productId: 'course.lifetime',
          type: Type.NON_CONSUMABLE,
          originalTransactionId: 'original-transaction',
          transactionId: 'transaction',
          environment: Environment.SANDBOX,
          expiresDate: null,
          sanitizedPayload: {},
        }),
      },
      purchaseOrderRepository: {
        findOne: jest.fn().mockResolvedValue({
          id: originalOrderId,
          userId: 'account-a',
          course: {},
          providerSnapshot: {},
          providerTransaction: {},
        }),
      },
    });

    await expect(
      service.restoreAppStorePurchase({
        userId: 'account-b',
        dto: {
          productId: 'course.lifetime',
          transactionId: 'transaction',
          signedTransactionInfo: 'signed-transaction',
        },
      }),
    ).rejects.toMatchObject<Partial<ConflictException>>({
      response: {
        code: 'APP_STORE_PURCHASE_LINKED_TO_ANOTHER_USER',
        message: 'The App Store purchase belongs to another application user.',
      },
    });
  });
});
