import { BadRequestException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';

import { AppleSignInTokenService } from '../auth/apple-sign-in-token.service';
import { SessionSocketRegistryService } from '../auth/session-socket-registry.service';
import { UserAccountDeletionService } from './user-account-deletion.service';
import { UserDeletionSource } from './entities/deleted-user-audit.entity';

describe('UserAccountDeletionService Apple revocation', () => {
  const deletionParams = {
    targetUserId: 'user-id',
    deletedByUserId: 'user-id',
    source: UserDeletionSource.SELF_SERVICE,
  };

  function createService(
    appleAccount: Record<string, unknown> | null,
    sessionRows: Array<{ authSessionId: string }> = [],
  ) {
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
      query: jest.fn().mockResolvedValue(sessionRows),
      transaction: transactionMock,
    } as unknown as DataSource;
    const revokeMock = jest.fn().mockResolvedValue(undefined);
    const appleTokens = {
      revokeEncryptedRefreshToken: revokeMock,
    } as unknown as AppleSignInTokenService;
    const disconnectSession = jest.fn();
    const sessionSockets = {
      disconnectSession,
    } as unknown as SessionSocketRegistryService;

    return {
      service: new UserAccountDeletionService(
        dataSource,
        appleTokens,
        sessionSockets,
      ),
      dataSource,
      appleTokens,
      transactionMock,
      revokeMock,
      disconnectSession,
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

describe('UserAccountDeletionService content erasure', () => {
  const dataSource = {} as DataSource;
  const appleTokens = {} as AppleSignInTokenService;
  const sessionSockets = {} as SessionSocketRegistryService;
  const service = new UserAccountDeletionService(
    dataSource,
    appleTokens,
    sessionSockets,
  );
  const deleteUserAuthoredContent = (
    manager: Pick<EntityManager, 'query'>,
    userId: string,
  ) =>
    (
      service as unknown as {
        deleteUserAuthoredContent(
          manager: Pick<EntityManager, 'query'>,
          userId: string,
        ): Promise<void>;
      }
    ).deleteUserAuthoredContent(manager, userId);

  it('disconnects every authenticated session before content erasure', () => {
    const disconnectSession = jest.fn();
    const serviceWithSockets = new UserAccountDeletionService(
      dataSource,
      appleTokens,
      { disconnectSession } as unknown as SessionSocketRegistryService,
    );

    (
      serviceWithSockets as unknown as {
        disconnectSessions(sessionIds: string[]): void;
      }
    ).disconnectSessions(['session-1', 'session-2']);

    expect(disconnectSession).toHaveBeenNthCalledWith(1, 'session-1');
    expect(disconnectSession).toHaveBeenNthCalledWith(2, 'session-2');
  });

  it('deletes authored messages and webinar chat, then repairs conversation pointers', async () => {
    const calls: Array<[string, unknown[] | undefined]> = [];
    const query = jest.fn((sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      return Promise.resolve(
        calls.length === 1
          ? [{ conversationId: '11111111-1111-1111-1111-111111111111' }]
          : [],
      );
    });
    const manager = { query };

    await deleteUserAuthoredContent(manager, 'user-id');

    expect(query).toHaveBeenCalledTimes(10);
    expect(calls[0][0]).toContain('SELECT DISTINCT "conversationId"');
    expect(calls[1][0]).toContain('UPDATE "conversations"');
    expect(calls[2][0]).toContain('"lastReadMessageId" = CASE');
    expect(calls[2][0]).toContain('"lastDeliveredMessageId" = CASE');
    expect(calls[3][0]).toContain('DELETE FROM "message_attachments"');
    expect(calls[4][0]).toContain('DELETE FROM "message_receipts"');
    expect(calls[4][0]).toContain('WHERE "userId" = $1');
    expect(calls[5][0]).toContain('DELETE FROM "message_delivery_jobs"');
    expect(calls[5][0]).toContain('WHERE "receiverId" = $1');
    expect(calls[6][0]).toContain('DELETE FROM "messages"');
    expect(calls[7][0]).toContain('SELECT DISTINCT ON');
    expect(calls[8][0]).toContain('UPDATE "conversation_participants"');
    expect(calls[9][0]).toContain('DELETE FROM "webinar_chat_messages"');
    expect(calls[6][1]).toEqual(['user-id']);
  });

  it('does not update conversation pointers when the user authored no messages', async () => {
    const calls: Array<[string, unknown[] | undefined]> = [];
    const query = jest.fn((sql: string, params?: unknown[]) => {
      calls.push([sql, params]);
      return Promise.resolve([]);
    });
    const manager = { query };

    await deleteUserAuthoredContent(manager, 'user-id');

    expect(query).toHaveBeenCalledTimes(6);
    expect(calls[4][0]).toContain('DELETE FROM "messages"');
    expect(calls[5][0]).toContain('DELETE FROM "webinar_chat_messages"');
  });
});
