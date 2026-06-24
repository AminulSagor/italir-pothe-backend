import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ScoringService } from 'src/module-2/scoring/services/scoring.service';
import { LeaderboardReward } from '../entities/leaderboard-reward.entity';
import { LeaderboardRewardValue } from '../entities/leaderboard-reward-value.entity';
import {
  LeaderboardRewardStatus,
  LeaderboardRewardType,
  LeaderboardXpSourceType,
} from '../types/leaderboard.type';
import { LeaderboardProfileService } from './leaderboard-profile.service';
import { LeaderboardXpService } from './leaderboard-xp.service';

@Injectable()
export class LeaderboardRewardApplicationService {
  constructor(
    @InjectRepository(LeaderboardReward)
    private readonly rewardRepository: Repository<LeaderboardReward>,

    @InjectRepository(LeaderboardRewardValue)
    private readonly valueRepository: Repository<LeaderboardRewardValue>,

    private readonly scoringService: ScoringService,
    private readonly leaderboardXpService: LeaderboardXpService,
    private readonly profileService: LeaderboardProfileService,
  ) {}

  async applyReward(params: { rewardId: string; userId: string }) {
    const reward = await this.rewardRepository.findOne({
      where: {
        id: params.rewardId,
        userId: params.userId,
      },
      relations: {
        value: true,
      },
    });

    if (!reward) {
      throw new NotFoundException('Reward not found.');
    }

    if (
      reward.status === LeaderboardRewardStatus.REVOKED ||
      reward.status === LeaderboardRewardStatus.CANCELLED
    ) {
      throw new BadRequestException('This reward is no longer available.');
    }

    const value = reward.value;

    if (value?.appliedAt) {
      return {
        duplicated: true,
        rewardId: reward.id,
        status: reward.status,
        appliedAt: value.appliedAt,
        applicationReference: value.applicationReference,
      };
    }

    let applicationReference: string | null = null;
    let applicationResult: unknown = null;

    if (reward.rewardType === LeaderboardRewardType.XP) {
      const amount = value?.primaryAmount ?? 0;

      if (amount <= 0) {
        throw new BadRequestException('The XP reward amount is invalid.');
      }

      const profile = await this.profileService.ensureProfile(reward.userId);

      const scoringResult = await this.scoringService.recordManualXp({
        userId: reward.userId,
        sourceId: `leaderboard-reward:${reward.id}`,
        amount,
        reason: reward.title,
      });

      const leaderboardResult = await this.leaderboardXpService.awardXp({
        userId: reward.userId,
        sourceType: LeaderboardXpSourceType.ADMIN_REWARD,
        sourceReference: reward.id,
        idempotencyKey: `leaderboard-reward:${reward.id}:leaderboard-xp`,
        baseXp: scoringResult.baseXp,
        streakBonusXp: 0,
        masteryBonusXp: 0,
        speedBonusXp: 0,
        awardedXp: scoringResult.totalXpEarned,
        multiplier: scoringResult.boostMultiplier,
        streakDays: profile.streakDays,
      });

      applicationReference = `xp:${reward.id}`;

      applicationResult = {
        scoring: scoringResult,
        leaderboard: leaderboardResult,
      };
    } else if (this.isPhysicalReward(reward.rewardType)) {
      throw new BadRequestException(
        'Physical rewards are fulfilled through shipping.',
      );
    } else {
      /*
       * For Streak Freeze, CV Credits, AI Package,
       * course access, files, certificates and badges,
       * this value record acts as an idempotent reward
       * entitlement.
       *
       * A Package Store adapter can later consume the
       * same reward/value without changing the APIs.
       */
      applicationReference = `entitlement:${reward.id}`;

      applicationResult = {
        rewardType: reward.rewardType,
        primaryAmount: value?.primaryAmount ?? null,
        secondaryAmount: value?.secondaryAmount ?? null,
      };
    }

    if (value) {
      value.appliedAt = new Date();
      value.applicationReference = applicationReference;

      await this.valueRepository.save(value);
    }

    reward.status = this.getAppliedStatus(reward.rewardType);

    await this.rewardRepository.save(reward);

    return {
      duplicated: false,
      rewardId: reward.id,
      status: reward.status,
      appliedAt: value?.appliedAt ?? new Date(),
      applicationReference,
      result: applicationResult,
    };
  }

  private getAppliedStatus(
    rewardType: LeaderboardRewardType,
  ): LeaderboardRewardStatus {
    switch (rewardType) {
      case LeaderboardRewardType.COURSE_ACCESS:
      case LeaderboardRewardType.DOWNLOADABLE_FILE:
      case LeaderboardRewardType.CERTIFICATE:
      case LeaderboardRewardType.BADGE:
        return LeaderboardRewardStatus.ISSUED;

      default:
        return LeaderboardRewardStatus.CLAIMED;
    }
  }

  private isPhysicalReward(rewardType: LeaderboardRewardType): boolean {
    return (
      rewardType === LeaderboardRewardType.PHYSICAL_GIFT ||
      rewardType === LeaderboardRewardType.PHYSICAL_PRIZE
    );
  }
}
