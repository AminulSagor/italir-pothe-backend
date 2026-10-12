import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';

import { AppleSignInTokenService } from '../auth/apple-sign-in-token.service';
import { SessionSocketRegistryService } from '../auth/session-socket-registry.service';
import {
  SocialAuthProvider,
  UserSocialAccount,
} from '../auth/entities/user-social-account.entity';

import {
  DeletedUserAudit,
  UserDeletionSource,
} from './entities/deleted-user-audit.entity';
import { User, UserRole } from './entities/user.entity';

interface DeleteAccountParams {
  targetUserId: string;
  deletedByUserId: string | null;
  source: UserDeletionSource;
  expectedRole?: UserRole;
  preventLastAdminDeletion?: boolean;
}

@Injectable()
export class UserAccountDeletionService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly appleSignInTokenService: AppleSignInTokenService,
    private readonly sessionSocketRegistry: SessionSocketRegistryService,
  ) {}

  async deleteAccount(params: DeleteAccountParams) {
    await this.revokeAppleAuthorization(params.targetUserId);

    const activeSessionIds = await this.getActiveSessionIds(
      params.targetUserId,
    );

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);

      const user = await userRepository
        .createQueryBuilder('account')
        .setLock('pessimistic_write')
        .where('account.id = :userId', {
          userId: params.targetUserId,
        })
        .getOne();

      if (!user) {
        throw new NotFoundException('User account not found.');
      }

      if (params.expectedRole && user.role !== params.expectedRole) {
        throw new BadRequestException(
          `This account does not have the expected ${params.expectedRole} role.`,
        );
      }

      if (params.preventLastAdminDeletion && user.role === UserRole.ADMIN) {
        const adminCount = await userRepository.count({
          where: {
            role: UserRole.ADMIN,
          },
        });

        if (adminCount <= 1) {
          throw new BadRequestException(
            'Cannot delete the last remaining admin.',
          );
        }
      }

      if (
        params.deletedByUserId === params.targetUserId &&
        user.role === UserRole.ADMIN
      ) {
        throw new BadRequestException(
          'An admin cannot delete their own admin account.',
        );
      }

      // Stop authenticated chat and call activity after all deletion guards
      // pass, but before any user-authored content is erased.
      this.disconnectSessions(activeSessionIds);

      const auditRepository = manager.getRepository(DeletedUserAudit);

      const existingAudit = await auditRepository.findOne({
        where: {
          originalUserId: user.id,
        },
      });

      if (!existingAudit) {
        await auditRepository.save(
          auditRepository.create({
            originalUserId: user.id,

            displayName: 'Deleted User',

            originalRole: user.role,

            emailHash: this.hashValue(user.email),

            phoneHash: this.hashValue(user.phone),

            deletedByUserId: params.deletedByUserId,

            deletionSource: params.source,
          }),
        );
      }

      const now = new Date();

      // Keep device rows for audit, but disable every token.
      await manager.query(
        `
    UPDATE "user_devices"
    SET
      "isActive" = false,
      "fcmToken" = NULL,
      "voipToken" = NULL,

      "authSessionId" = NULL,
      "isSessionActive" = false,
      "authSessionExpiresAt" = NULL,

      "deactivatedAt" = $2,
      "lastActiveAt" = $2
    WHERE "userId" = $1
  `,
        [user.id, now],
      );

      // OTP codes contain no useful analytics information.
      const otpIdentifiers = [user.email, user.phone].filter(
        (value): value is string => Boolean(value),
      );

      if (otpIdentifiers.length > 0) {
        await manager.query(
          `
              DELETE FROM otps
              WHERE identifier = ANY($1::text[])
                 OR identifier LIKE $2
            `,
          [otpIdentifiers, `%${user.id}%`],
        );
      } else {
        await manager.query(
          `
              DELETE FROM otps
              WHERE identifier LIKE $1
            `,
          [`%${user.id}%`],
        );
      }

      await this.deleteUserAuthoredContent(manager, user.id);

      try {
        const deleteResult = await userRepository.delete(user.id);

        if (!deleteResult.affected) {
          throw new NotFoundException('User account was not deleted.');
        }
      } catch (error) {
        const code = (
          error as {
            code?: string;
          }
        ).code;

        if (code === '23503') {
          throw new BadRequestException(
            'A user foreign-key constraint still exists. Run the independent user deletion migration and keep TYPEORM_SYNC=false.',
          );
        }

        throw error;
      }

      return {
        message: 'User account deleted successfully.',

        deletedUserId: user.id,

        relatedRecordsPreserved: true,

        userAuthoredContentDeleted: true,
      };
    });
  }

  private async deleteUserAuthoredContent(
    manager: EntityManager,
    userId: string,
  ): Promise<void> {
    const affectedConversationResult: unknown = await manager.query(
      `
        SELECT DISTINCT "conversationId"
        FROM "messages"
        WHERE "senderId" = $1
      `,
      [userId],
    );

    if (!Array.isArray(affectedConversationResult)) {
      throw new Error('Failed to identify conversations for content erasure.');
    }

    const affectedConversationRows: unknown[] = affectedConversationResult;
    const conversationIds = affectedConversationRows
      .filter(
        (row): row is { conversationId: string } =>
          typeof row === 'object' &&
          row !== null &&
          'conversationId' in row &&
          typeof row.conversationId === 'string',
      )
      .map(({ conversationId }) => conversationId)
      .sort();

    if (conversationIds.length > 0) {
      // Break the last-message reference before removing authored messages.
      await manager.query(
        `
          UPDATE "conversations"
          SET
            "lastMessageId" = NULL,
            "lastMessageAt" = NULL
          WHERE "id" = ANY($1::uuid[])
        `,
        [conversationIds],
      );

      // These pointers are optional denormalized references. Clear only the
      // ones that target content being erased so deletion remains safe even
      // when a production database is missing the expected SET NULL foreign
      // keys. Sequence numbers are retained for read/delivery progress.
      await manager.query(
        `
          UPDATE "conversation_participants" AS participant
          SET
            "lastReadMessageId" = CASE
              WHEN participant."lastReadMessageId" IN (
                SELECT "id" FROM "messages" WHERE "senderId" = $1
              ) THEN NULL
              ELSE participant."lastReadMessageId"
            END,
            "lastDeliveredMessageId" = CASE
              WHEN participant."lastDeliveredMessageId" IN (
                SELECT "id" FROM "messages" WHERE "senderId" = $1
              ) THEN NULL
              ELSE participant."lastDeliveredMessageId"
            END
          WHERE participant."lastReadMessageId" IN (
              SELECT "id" FROM "messages" WHERE "senderId" = $1
            )
             OR participant."lastDeliveredMessageId" IN (
              SELECT "id" FROM "messages" WHERE "senderId" = $1
            )
        `,
        [userId],
      );
    }

    // Delete dependent rows explicitly. Production schema synchronization is
    // disabled, so privacy erasure must not rely only on ORM cascade metadata.
    await manager.query(
      `
        DELETE FROM "message_attachments"
        WHERE "messageId" IN (
          SELECT "id"
          FROM "messages"
          WHERE "senderId" = $1
        )
      `,
      [userId],
    );

    await manager.query(
      `
        DELETE FROM "message_receipts"
        WHERE "userId" = $1
           OR "messageId" IN (
            SELECT "id"
            FROM "messages"
            WHERE "senderId" = $1
          )
      `,
      [userId],
    );

    await manager.query(
      `
        DELETE FROM "message_delivery_jobs"
        WHERE "receiverId" = $1
           OR "messageId" IN (
            SELECT "id"
            FROM "messages"
            WHERE "senderId" = $1
          )
      `,
      [userId],
    );

    await manager.query(
      `
        DELETE FROM "messages"
        WHERE "senderId" = $1
      `,
      [userId],
    );

    if (conversationIds.length > 0) {
      // Point each affected conversation at its newest remaining message.
      await manager.query(
        `
          UPDATE "conversations" AS conversation
          SET
            "lastMessageId" = latest."id",
            "lastMessageAt" = latest."createdAt"
          FROM (
            SELECT DISTINCT ON (message."conversationId")
              message."conversationId",
              message."id",
              message."createdAt"
            FROM "messages" AS message
            WHERE message."conversationId" = ANY($1::uuid[])
            ORDER BY
              message."conversationId",
              message."sequenceNo" DESC,
              message."createdAt" DESC
          ) AS latest
          WHERE conversation."id" = latest."conversationId"
        `,
        [conversationIds],
      );

      await manager.query(
        `
          UPDATE "conversation_participants" AS participant
          SET "unreadCount" = (
            SELECT COUNT(*)::int
            FROM "messages" AS message
            WHERE message."conversationId" = participant."conversationId"
              AND message."sequenceNo" > participant."lastReadSequenceNo"
              AND message."senderId" IS DISTINCT FROM participant."userId"
          )
          WHERE participant."conversationId" = ANY($1::uuid[])
        `,
        [conversationIds],
      );
    }

    await manager.query(
      `
        DELETE FROM "webinar_chat_messages"
        WHERE "senderUserId" = $1
      `,
      [userId],
    );
  }

  private async getActiveSessionIds(userId: string): Promise<string[]> {
    const result: unknown = await this.dataSource.query(
      `
        SELECT DISTINCT "authSessionId"
        FROM "user_devices"
        WHERE "userId" = $1
          AND "isSessionActive" = true
          AND "authSessionId" IS NOT NULL
      `,
      [userId],
    );

    if (!Array.isArray(result)) {
      return [];
    }

    const rows: unknown[] = result;
    return rows
      .filter(
        (row): row is { authSessionId: string } =>
          typeof row === 'object' &&
          row !== null &&
          'authSessionId' in row &&
          typeof row.authSessionId === 'string' &&
          row.authSessionId.trim().length > 0,
      )
      .map(({ authSessionId }) => authSessionId.trim());
  }

  private disconnectSessions(sessionIds: string[]): void {
    for (const sessionId of sessionIds) {
      this.sessionSocketRegistry.disconnectSession(sessionId);
    }
  }

  private async revokeAppleAuthorization(userId: string): Promise<void> {
    const appleAccount = await this.dataSource
      .getRepository(UserSocialAccount)
      .createQueryBuilder('socialAccount')
      .addSelect([
        'socialAccount.appleRefreshTokenCiphertext',
        'socialAccount.appleRefreshTokenIv',
        'socialAccount.appleRefreshTokenAuthTag',
      ])
      .where('socialAccount.userId = :userId', { userId })
      .andWhere('socialAccount.provider = :provider', {
        provider: SocialAuthProvider.APPLE,
      })
      .getOne();

    if (!appleAccount) return;

    const ciphertext = appleAccount.appleRefreshTokenCiphertext?.trim() ?? '';
    const iv = appleAccount.appleRefreshTokenIv?.trim() ?? '';
    const authTag = appleAccount.appleRefreshTokenAuthTag?.trim() ?? '';

    if (!ciphertext || !iv || !authTag) {
      throw new BadRequestException(
        'Sign in with Apple again before deleting this account so Apple authorization can be revoked.',
      );
    }

    await this.appleSignInTokenService.revokeEncryptedRefreshToken({
      ciphertext,
      iv,
      authTag,
    });
  }

  private hashValue(value: string | null) {
    if (!value?.trim()) {
      return null;
    }

    return createHash('sha256')
      .update(value.trim().toLowerCase())
      .digest('hex');
  }
}
