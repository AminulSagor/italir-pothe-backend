import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';

import { AppleSignInTokenService } from '../auth/apple-sign-in-token.service';
import { SessionSocketRegistryService } from '../auth/session-socket-registry.service';
import { AiConsentSessionRevocationService } from '../ai-consent/ai-consent-session-revocation.service';
import {
  S3DeletionJob,
  S3DeletionOperation,
} from '../files/entities/s3-deletion-job.entity';
import { FileUploadStatus } from '../files/entities/file.entity';
import { S3DeletionQueueService } from '../files/services/s3-deletion-queue.service';
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

interface UserStorageDeletionPlan {
  files: Array<{
    id: string;
    storageKey: string;
    mediaAssetId: string | null;
    sharedByMessage: boolean;
    retainedByRecord: boolean;
  }>;
  multipartUploads: Array<{ storageKey: string; uploadId: string }>;
  pendingSingleUploads: Array<{ storageKey: string; expiresAt: Date }>;
}

@Injectable()
export class UserAccountDeletionService {
  private readonly logger = new Logger(UserAccountDeletionService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly appleSignInTokenService: AppleSignInTokenService,
    private readonly sessionSocketRegistry: SessionSocketRegistryService,
    private readonly aiSessionRevocationService: AiConsentSessionRevocationService,
    private readonly s3DeletionQueueService: S3DeletionQueueService,
    private readonly configService: ConfigService,
  ) {}

  async deleteAccount(params: DeleteAccountParams) {
    await this.revokeAppleAuthorization(params.targetUserId);

    const activeSessionIds = await this.getActiveSessionIds(
      params.targetUserId,
    );

    const deletionBatchId = randomUUID();
    const result = await this.dataSource.transaction(async (manager) => {
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

      try {
        await this.aiSessionRevocationService.revokeUserSessions(user.id);
      } catch {
        this.logger.error(
          'Account deletion could not proactively stop every AI session; authentication invalidation will prevent renewed authorization.',
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
      const storagePlan = await this.collectUserStorageDeletionPlan(
        manager,
        user.id,
      );

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

      const storageDeletion = await this.queueUserStorageDeletion(
        manager,
        user.id,
        deletionBatchId,
        storagePlan,
      );

      return {
        message: 'User account deleted successfully.',

        deletedUserId: user.id,

        relatedRecordsPreserved: true,

        userAuthoredContentDeleted: true,

        storageDeletion,
      };
    });

    void this.s3DeletionQueueService.processDueJobs().catch(() => {
      this.logger.warn(
        'Immediate S3 privacy deletion did not complete; the durable retry queue remains active.',
      );
    });
    return result;
  }

  private async queueUserStorageDeletion(
    manager: EntityManager,
    userId: string,
    batchId: string,
    plan: UserStorageDeletionPlan,
  ): Promise<{ queuedObjects: number; preservedSharedOrRetained: number }> {
    const fileRows = plan.files;
    const multipartRows = plan.multipartUploads;
    const pendingSingleUploads = plan.pendingSingleUploads;
    const inFlightSafetyDelay = new Date(Date.now() + 60 * 60 * 1000);
    const deletable = fileRows.filter(
      (file) => !file.sharedByMessage && !file.retainedByRecord,
    );
    const preserved = fileRows.filter((file) => !deletable.includes(file));
    const jobs: Array<{
      operation: S3DeletionOperation;
      storageKey: string;
      uploadId: string | null;
      nextAttemptAt?: Date;
    }> = [];

    for (const file of deletable) {
      jobs.push({
        operation: S3DeletionOperation.OBJECT,
        storageKey: file.storageKey,
        uploadId: null,
        nextAttemptAt: inFlightSafetyDelay,
      });
      if (file.mediaAssetId) {
        const hlsPrefix =
          this.configService
            .get<string>('VIDEO_HLS_STORAGE_PREFIX')
            ?.trim()
            .replace(/^\/+|\/+$/g, '') || 'italir-pothe/hls';
        jobs.push({
          operation: S3DeletionOperation.PREFIX,
          storageKey: `${hlsPrefix}/${file.mediaAssetId}/`,
          uploadId: null,
          nextAttemptAt: new Date(Date.now() + 60 * 60 * 1000),
        });
      }
    }

    if (deletable.length > 0) {
      await manager.query(
        `
          UPDATE "video_transcode_jobs"
          SET
            "status" = 'failed',
            "maxAttempts" = "attempts",
            "availableAt" = now() + interval '1 hour',
            "lastError" = 'Source owner account was deleted.',
            "updatedAt" = now()
          WHERE "sourceFileId" = ANY($1::uuid[])
            AND "status" IN ('pending', 'processing')
        `,
        [deletable.map((file) => file.id)],
      );
    }

    for (const upload of multipartRows) {
      jobs.push(
        {
          operation: S3DeletionOperation.MULTIPART,
          storageKey: upload.storageKey,
          uploadId: upload.uploadId,
        },
        {
          operation: S3DeletionOperation.OBJECT,
          storageKey: upload.storageKey,
          uploadId: null,
          nextAttemptAt: inFlightSafetyDelay,
        },
      );
    }

    for (const upload of pendingSingleUploads) {
      jobs.push({
        operation: S3DeletionOperation.OBJECT,
        storageKey: upload.storageKey,
        uploadId: null,
        nextAttemptAt: new Date(
          Math.max(
            inFlightSafetyDelay.getTime(),
            new Date(upload.expiresAt).getTime() + 60_000,
          ),
        ),
      });
    }

    jobs.push({
      operation: S3DeletionOperation.PREFIX,
      storageKey: `resume-studio/generated/${userId}/`,
      uploadId: null,
      nextAttemptAt: new Date(Date.now() + 60 * 60 * 1000),
    });

    const uniqueJobs = Array.from(
      new Map(
        jobs.map((job) => [
          `${job.operation}\u0000${job.storageKey}\u0000${job.uploadId ?? ''}`,
          job,
        ]),
      ).values(),
    );
    if (uniqueJobs.length > 0) {
      await manager
        .createQueryBuilder()
        .insert()
        .into(S3DeletionJob)
        .values(
          uniqueJobs.map((job) => ({
            ...job,
            batchId,
            attempts: 0,
            nextAttemptAt: job.nextAttemptAt ?? new Date(),
            lockedAt: null,
            lastError: null,
          })),
        )
        .orIgnore()
        .execute();
    }

    if (deletable.length > 0) {
      await manager.query(
        `
          UPDATE "files"
          SET
            "ownerUserId" = NULL,
            "originalName" = 'deleted-account-file',
            "uploadStatus" = $2,
            "pdfProcessingError" = NULL,
            "updatedAt" = now()
          WHERE "id" = ANY($1::uuid[])
        `,
        [
          deletable.map((file) => file.id),
          FileUploadStatus.ARCHIVED,
        ],
      );
    }
    if (preserved.length > 0) {
      await manager.query(
        `
          UPDATE "files"
          SET "ownerUserId" = NULL, "updatedAt" = now()
          WHERE "id" = ANY($1::uuid[])
        `,
        [preserved.map((file) => file.id)],
      );
    }

    return {
      queuedObjects: uniqueJobs.length,
      preservedSharedOrRetained: preserved.length,
    };
  }

  private async collectUserStorageDeletionPlan(
    manager: EntityManager,
    userId: string,
  ): Promise<UserStorageDeletionPlan> {
    const files: UserStorageDeletionPlan['files'] = await manager.query(
      `
        SELECT
          file."id",
          file."storageKey",
          media."id" AS "mediaAssetId",
          EXISTS (
            SELECT 1
            FROM "message_attachments" AS attachment
            WHERE attachment."fileUrl" LIKE '%' || file."storageKey" || '%'
          ) AS "sharedByMessage",
          (
            EXISTS (
              SELECT 1 FROM "user_reports"
              WHERE "evidenceFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "ai_content_reports"
              WHERE "aiContentFileId" = file."id"
                 OR "screenshotFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "report_visual_evidence"
              WHERE "evidenceFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "certificates"
              WHERE "pdfFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "exam_answers"
              WHERE "audioFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "users"
              WHERE "profilePhotoFileId" = file."id"
                AND "id" <> $1
            )
            OR EXISTS (
              SELECT 1 FROM "cv_assistant_sessions"
              WHERE "userId" <> $1
                AND (
                  "profilePhotoFileId" = file."id"
                  OR "referenceImageFileIds" ? file."id"::text
                )
            )
            OR EXISTS (
              SELECT 1 FROM "cv_generations"
              WHERE "userId" <> $1
                AND (
                  "profilePhotoFileId" = file."id"
                  OR "generatedImageFileId" = file."id"
                  OR "referenceImageFileIds" ? file."id"::text
                )
            )
            OR EXISTS (
              SELECT 1 FROM "media_assets" AS referencing_media
              INNER JOIN "files" AS source_file
                ON source_file."id" = referencing_media."fileId"
              WHERE referencing_media."thumbnailFileId" = file."id"
                AND source_file."ownerUserId" IS DISTINCT FROM $1
            )
            OR EXISTS (
              SELECT 1 FROM "survival_situations"
              WHERE "resourceFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "notification_events"
              WHERE "imageFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "scheduled_notifications"
              WHERE "imageFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "quiz_questions"
              WHERE "mediaFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "skill_builder_sentences"
              WHERE "aiVoiceFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "lessons"
              WHERE "videoFileId" = file."id"
                 OR "theoryAudioFileId" = file."id"
                 OR "supplementaryMaterialFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "skill_builder_career_tracks"
              WHERE "introVideoFileId" = file."id"
                 OR "theoryResourceFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "lesson_vocabularies"
              WHERE "aiPronunciationFileId" = file."id"
            )
            OR EXISTS (
              SELECT 1 FROM "exam_questions"
              WHERE "audioFileId" = file."id"
                 OR "imageFileId" = file."id"
            )
          ) AS "retainedByRecord"
        FROM "files" AS file
        LEFT JOIN "media_assets" AS media ON media."fileId" = file."id"
        WHERE file."ownerUserId" = $1
        FOR UPDATE OF file
      `,
      [userId],
    );
    const multipartUploads: UserStorageDeletionPlan['multipartUploads'] =
      await manager.query(
        `
          DELETE FROM "multipart_upload_sessions"
          WHERE "ownerUserId" = $1
          RETURNING "storageKey", "uploadId"
        `,
        [userId],
      );
    const pendingSingleUploads: UserStorageDeletionPlan['pendingSingleUploads'] =
      await manager.query(
        `
          DELETE FROM "pending_single_uploads"
          WHERE "ownerUserId" = $1
          RETURNING "storageKey", "expiresAt"
        `,
        [userId],
      );
    return { files, multipartUploads, pendingSingleUploads };
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
