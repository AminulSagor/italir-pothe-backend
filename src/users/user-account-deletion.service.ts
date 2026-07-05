import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';

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
  constructor(private readonly dataSource: DataSource) {}

  async deleteAccount(params: DeleteAccountParams) {
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
            UPDATE user_devices
            SET
              "isActive" = false,
              "fcmToken" = NULL,
              "voipToken" = NULL,
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
      };
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
