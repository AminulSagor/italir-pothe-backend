import { ConflictException } from '@nestjs/common';

import { UserSocialAccount } from 'src/auth/entities/user-social-account.entity';
import { User } from 'src/users/entities/user.entity';

import { PackageStoreService } from './package-store.service';

describe('PackageStoreService App Store restore ownership', () => {
  it('returns a privacy-safe account hint for a confirmed owner conflict', async () => {
    const service = Object.create(
      PackageStoreService.prototype,
    ) as PackageStoreService;

    const userRepository = {
      findOne: jest.fn().mockResolvedValue({
        fullName: 'Aminul Sagor',
        email: 'aminul@example.com',
        phone: null,
      }),
    };
    const socialAccountRepository = {
      find: jest.fn().mockResolvedValue([{ provider: 'google' }]),
    };

    Object.assign(service, {
      appStoreBillingService: {
        isRealVerificationEnabled: jest.fn().mockReturnValue(true),
        verifyRestoredSubscription: jest.fn().mockResolvedValue({
          originalTransactionId: 'original-transaction',
        }),
      },
      appStoreSubscriptionLifecycleService: {
        findByOriginalTransactionId: jest.fn().mockResolvedValue({
          userId: 'account-a',
          initialOrderId: 'initial-order',
        }),
      },
      dataSource: {
        getRepository: jest.fn((entity: unknown) => {
          if (entity === User) return userRepository;
          if (entity === UserSocialAccount) return socialAccountRepository;
          throw new Error('Unexpected repository');
        }),
      },
    });

    await expect(
      service.restoreAppStoreSubscription({
        userId: 'account-b',
        dto: {
          productId: 'streak.monthly',
          transactionId: 'transaction',
          signedTransactionInfo: 'signed-transaction',
        },
      }),
    ).rejects.toMatchObject<Partial<ConflictException>>({
      response: {
        code: 'APP_STORE_SUBSCRIPTION_LINKED_TO_ANOTHER_USER',
        message: 'This App Store subscription is linked to another account.',
        accountHint: {
          maskedName: 'A*** S***',
          signInMethods: ['google', 'email'],
        },
      },
    });
  });
});
