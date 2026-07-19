import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from '../users/entities/user.entity';
import { ModerationAction } from 'src/moderation/entities/moderation-action.entity';

export const ACCOUNT_BANNED_CODE = 'ACCOUNT_BANNED';

export interface AccountBanDetails {
  reason: string;
  effectiveAt: Date | null;
  caseNumber: string | null;
}

@Injectable()
export class AccountModerationStatusService {
  constructor(
    @InjectRepository(ModerationAction)
    private readonly moderationActionRepository: Repository<ModerationAction>,
  ) {}

  async assertAccountIsActive(
    user: Pick<User, 'id' | 'isBanned'>,
  ): Promise<void> {
    if (!user.isBanned) {
      return;
    }

    const banDetails = await this.findLatestPermanentBan(user.id);

    throw new ForbiddenException({
      statusCode: 403,
      code: ACCOUNT_BANNED_CODE,
      message: 'Your account has been permanently restricted.',
      details: {
        reason:
          banDetails?.reason ??
          'This account has been permanently restricted by the administration.',
        effectiveAt: banDetails?.effectiveAt?.toISOString() ?? null,
        caseNumber: banDetails?.caseNumber ?? null,
      },
    });
  }

  private async findLatestPermanentBan(
    userId: string,
  ): Promise<AccountBanDetails | null> {
    const action = await this.moderationActionRepository
      .createQueryBuilder('action')
      .innerJoinAndSelect('action.report', 'report')
      .where('report.subjectId = :userId', { userId })
      .andWhere('action.actionType = :actionType', {
        actionType: 'permanent_ban',
      })
      .orderBy('action.loggedAt', 'DESC')
      .getOne();

    if (!action) {
      return null;
    }

    return {
      reason: action.actionReason,
      effectiveAt: action.loggedAt,
      caseNumber: action.report?.caseNumber ?? null,
    };
  }
}
