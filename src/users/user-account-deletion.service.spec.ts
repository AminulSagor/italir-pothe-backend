import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';

import { AppleSignInTokenService } from '../auth/apple-sign-in-token.service';
import { UserAccountDeletionService } from './user-account-deletion.service';
import { UserDeletionSource } from './entities/deleted-user-audit.entity';

describe('UserAccountDeletionService Apple revocation', () => {
  const deletionParams = {
    targetUserId: 'user-id',
    deletedByUserId: 'user-id',
    source: UserDeletionSource.SELF_SERVICE,
  };

  function createService(appleAccount: Record<string, unknown> | null) {
    const queryBuilder = {
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue(appleAccount),
    };
    const transactionError = new Error('transaction reached');
    const transactionMock = jest.fn().mockRejectedValue(transactionError);
    const dataSource = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => queryBuilder),
      })),
      transaction: transactionMock,
    } as unknown as DataSource;
    const revokeMock = jest.fn().mockResolvedValue(undefined);
    const appleTokens = {
      revokeEncryptedRefreshToken: revokeMock,
    } as unknown as AppleSignInTokenService;

    return {
      service: new UserAccountDeletionService(dataSource, appleTokens),
      dataSource,
      appleTokens,
      transactionMock,
      revokeMock,
      transactionError,
    };
  }

  it('revokes the stored Apple refresh token before starting deletion', async () => {
    const fixture = createService({
      appleRefreshTokenCiphertext: 'ciphertext',
      appleRefreshTokenIv: 'iv',
      appleRefreshTokenAuthTag: 'tag',
    });

    await expect(fixture.service.deleteAccount(deletionParams)).rejects.toBe(
      fixture.transactionError,
    );
    expect(fixture.revokeMock).toHaveBeenCalledWith({
      ciphertext: 'ciphertext',
      iv: 'iv',
      authTag: 'tag',
    });
    expect(fixture.transactionMock).toHaveBeenCalledTimes(1);
  });

  it('does not delete a legacy Apple account until it reauthorizes', async () => {
    const fixture = createService({
      appleRefreshTokenCiphertext: null,
      appleRefreshTokenIv: null,
      appleRefreshTokenAuthTag: null,
    });

    await expect(
      fixture.service.deleteAccount(deletionParams),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(fixture.revokeMock).not.toHaveBeenCalled();
    expect(fixture.transactionMock).not.toHaveBeenCalled();
  });
});
