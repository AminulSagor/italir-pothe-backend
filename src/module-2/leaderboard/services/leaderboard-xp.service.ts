import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { XpBoostSource } from 'src/module-2/scoring/entities/user-xp-boost.entity';
import { ScoringService } from 'src/module-2/scoring/services/scoring.service';
import { LeaguePromotionEvent } from '../entities/league-promotion-event.entity';
import { LeaderboardProfile } from '../entities/leaderboard-profile.entity';
import { LeaderboardXpEvent } from '../entities/leaderboard-xp-event.entity';
import { LeaderboardXpSourceType } from '../types/leaderboard.type';
import { LeagueConfigService } from './league-config.service';
import { LeaderboardProfileService } from './leaderboard-profile.service';

export interface AwardLeaderboardXpInput {
  userId: string;
  sourceType: LeaderboardXpSourceType;
  sourceReference?: string | null;
  idempotencyKey: string;

  /**
   * XP breakdown before applying the scoring boost.
   */
  baseXp: number;
  streakBonusXp?: number;
  masteryBonusXp?: number;
  speedBonusXp?: number;

  /**
   * Exact final XP already calculated and saved
   * by ScoringService.
   *
   * Leaderboard must never calculate this again.
   */
  awardedXp: number;

  /**
   * Exact multiplier used by ScoringService
   * for this XP transaction.
   */
  multiplier: number;

  streakDays?: number;
}

export interface AwardQuizXpInput {
  userId: string;
  sourceReference: string;
  idempotencyKey: string;

  baseXp: number;
  comboBonusXp: number;
  masteryBonusXp: number;
  speedBonusXp: number;

  awardedXp: number;
  multiplier: number;
  streakDays?: number;
}

interface XpBoostPlan {
  multiplier: number;
  expiresAt: Date;
}

@Injectable()
export class LeaderboardXpService {
  constructor(
    @InjectRepository(LeaderboardXpEvent)
    private readonly xpEventRepository: Repository<LeaderboardXpEvent>,

    private readonly dataSource: DataSource,
    private readonly leagueConfigService: LeagueConfigService,
    private readonly profileService: LeaderboardProfileService,
    private readonly scoringService: ScoringService,
  ) {}

  /**
   * Call this only after ScoringService has successfully
   * created or returned the quiz XP transaction.
   */
  async awardQuizXp(input: AwardQuizXpInput) {
    return this.awardXp({
      userId: input.userId,
      sourceType: LeaderboardXpSourceType.QUIZ_COMPLETION,
      sourceReference: input.sourceReference,
      idempotencyKey: input.idempotencyKey,
      baseXp: input.baseXp,
      streakBonusXp: input.comboBonusXp,
      masteryBonusXp: input.masteryBonusXp,
      speedBonusXp: input.speedBonusXp,
      awardedXp: input.awardedXp,
      multiplier: input.multiplier,
      streakDays: input.streakDays,
    });
  }

  /**
   * Mirrors an XP reward that was already processed
   * by ScoringService.
   */
  async awardXp(input: AwardLeaderboardXpInput) {
    this.validateInput(input);

    await this.profileService.ensureProfile(input.userId);

    const definitions = await this.leagueConfigService.getDefinitions();

    const result = await this.dataSource.transaction(async (manager) => {
      const profileRepository = manager.getRepository(LeaderboardProfile);

      const eventRepository = manager.getRepository(LeaderboardXpEvent);

      const promotionRepository = manager.getRepository(LeaguePromotionEvent);

      const duplicate = await eventRepository.findOne({
        where: {
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
        },
      });

      if (duplicate) {
        const profile = await profileRepository.findOneOrFail({
          where: {
            userId: input.userId,
          },
        });

        const currentLeague = this.leagueConfigService.resolveLeague(
          profile.totalXp,
          definitions,
        );

        return {
          duplicated: true,
          eventId: duplicate.id,
          previousTotalXp: profile.totalXp,
          awardedXp: duplicate.awardedXp,
          totalXp: profile.totalXp,
          multiplier: Number(duplicate.multiplier),
          previousLeague: this.leagueConfigService.toResponse(currentLeague),
          currentLeague: this.leagueConfigService.toResponse(currentLeague),
          promotionEventId: null,
          xpBoost: this.getProfileBoost(profile),
          xpBoostPlan: this.getProfileBoostPlan(profile),
        };
      }

      const profile = await profileRepository
        .createQueryBuilder('profile')
        .setLock('pessimistic_write')
        .where('profile.userId = :userId', {
          userId: input.userId,
        })
        .getOneOrFail();

      const previousTotalXp = profile.totalXp;

      const previousLeague = this.leagueConfigService.resolveLeague(
        previousTotalXp,
        definitions,
      );

      const now = new Date();

      /*
       * Use the exact XP returned by ScoringService.
       * Do not multiply or recalculate it here.
       */
      profile.totalXp += input.awardedXp;
      profile.lastActivityAt = now;

      if (input.streakDays !== undefined) {
        profile.streakDays = Math.max(0, input.streakDays);
      }

      const currentLeague = this.leagueConfigService.resolveLeague(
        profile.totalXp,
        definitions,
      );

      const event = eventRepository.create({
        userId: input.userId,
        sourceType: input.sourceType,
        sourceReference: input.sourceReference ?? null,
        idempotencyKey: input.idempotencyKey,
        baseXp: input.baseXp,
        streakBonusXp: input.streakBonusXp ?? 0,
        masteryBonusXp: input.masteryBonusXp ?? 0,
        speedBonusXp: input.speedBonusXp ?? 0,
        multiplier: input.multiplier.toFixed(2),
        awardedXp: input.awardedXp,
      });

      await eventRepository.save(event);

      let promotionEvent: LeaguePromotionEvent | null = null;

      let xpBoostPlan: XpBoostPlan | null = null;

      if (currentLeague.sortOrder > previousLeague.sortOrder) {
        const promotionMultiplier = Number(currentLeague.xpBoostMultiplier);

        let boostExpiresAt: Date | null = null;

        if (promotionMultiplier > 1 && currentLeague.xpBoostDurationHours > 0) {
          boostExpiresAt = new Date(
            now.getTime() + currentLeague.xpBoostDurationHours * 60 * 60 * 1000,
          );

          profile.xpBoostMultiplier = promotionMultiplier.toFixed(2);

          profile.xpBoostExpiresAt = boostExpiresAt;

          xpBoostPlan = {
            multiplier: promotionMultiplier,
            expiresAt: boostExpiresAt,
          };
        }

        promotionEvent = promotionRepository.create({
          userId: input.userId,
          fromLeague: previousLeague.key,
          toLeague: currentLeague.key,
          totalXp: profile.totalXp,
          xpBoostMultiplier: promotionMultiplier.toFixed(2),
          xpBoostExpiresAt: boostExpiresAt,
          isAcknowledged: false,
          acknowledgedAt: null,
        });

        promotionEvent = await promotionRepository.save(promotionEvent);
      }

      await profileRepository.save(profile);

      return {
        duplicated: false,
        eventId: event.id,
        previousTotalXp,
        awardedXp: input.awardedXp,
        totalXp: profile.totalXp,
        multiplier: input.multiplier,
        previousLeague: this.leagueConfigService.toResponse(previousLeague),
        currentLeague: this.leagueConfigService.toResponse(currentLeague),
        promotionEventId: promotionEvent?.id ?? null,
        xpBoost: this.getProfileBoost(profile),
        xpBoostPlan,
      };
    });

    /*
     * Create the promotion boost inside the existing
     * scoring system so future ScoringService rewards
     * use the new multiplier.
     *
     * This is called after the leaderboard transaction.
     */
    await this.ensureScoringBoost(input.userId, result.xpBoostPlan);

    const { xpBoostPlan, ...response } = result;

    return response;
  }

  private async ensureScoringBoost(
    userId: string,
    plan: XpBoostPlan | null,
  ): Promise<void> {
    if (!plan) {
      return;
    }

    const remainingSeconds = Math.max(
      1,
      Math.ceil((plan.expiresAt.getTime() - Date.now()) / 1000),
    );

    const currentBoost = await this.scoringService.getActiveXpBoost(userId);

    const alreadyActive =
      currentBoost.isActive &&
      currentBoost.expiresAt !== null &&
      currentBoost.multiplier >= plan.multiplier &&
      currentBoost.expiresAt.getTime() >= plan.expiresAt.getTime() - 5000;

    if (alreadyActive) {
      return;
    }

    await this.scoringService.createXpBoost({
      userId,
      multiplier: plan.multiplier,
      durationSeconds: remainingSeconds,
      source: XpBoostSource.PROMOTION,
    });
  }

  private getProfileBoost(profile: LeaderboardProfile) {
    if (
      !profile.xpBoostExpiresAt ||
      profile.xpBoostExpiresAt <= new Date() ||
      Number(profile.xpBoostMultiplier) <= 1
    ) {
      return null;
    }

    return {
      multiplier: Number(profile.xpBoostMultiplier),
      expiresAt: profile.xpBoostExpiresAt,
      remainingSeconds: Math.max(
        0,
        Math.floor((profile.xpBoostExpiresAt.getTime() - Date.now()) / 1000),
      ),
    };
  }

  private getProfileBoostPlan(profile: LeaderboardProfile): XpBoostPlan | null {
    if (
      !profile.xpBoostExpiresAt ||
      profile.xpBoostExpiresAt <= new Date() ||
      Number(profile.xpBoostMultiplier) <= 1
    ) {
      return null;
    }

    return {
      multiplier: Number(profile.xpBoostMultiplier),
      expiresAt: profile.xpBoostExpiresAt,
    };
  }

  private validateInput(input: AwardLeaderboardXpInput): void {
    const integerFields: Array<{
      name: string;
      value: number;
    }> = [
      {
        name: 'baseXp',
        value: input.baseXp,
      },
      {
        name: 'streakBonusXp',
        value: input.streakBonusXp ?? 0,
      },
      {
        name: 'masteryBonusXp',
        value: input.masteryBonusXp ?? 0,
      },
      {
        name: 'speedBonusXp',
        value: input.speedBonusXp ?? 0,
      },
      {
        name: 'awardedXp',
        value: input.awardedXp,
      },
    ];

    for (const field of integerFields) {
      if (!Number.isInteger(field.value) || field.value < 0) {
        throw new BadRequestException(
          `${field.name} must be a non-negative integer.`,
        );
      }
    }

    if (!Number.isFinite(input.multiplier) || input.multiplier < 1) {
      throw new BadRequestException('multiplier must be at least 1.');
    }
  }
}
