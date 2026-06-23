import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LeaderboardQueryDto } from '../dto/leaderboard.dto';
import { LeaguePromotionEvent } from '../entities/league-promotion-event.entity';
import { LeaderboardProfile } from '../entities/leaderboard-profile.entity';
import { LeaderboardScope, LeaderboardZone } from '../types/leaderboard.type';
import { LeagueConfigService } from './league-config.service';
import { LeaderboardProfileService } from './leaderboard-profile.service';

type RankedProfile = {
  profile: LeaderboardProfile;
  rank: number;
};

@Injectable()
export class LeaderboardService {
  constructor(
    @InjectRepository(LeaderboardProfile)
    private readonly profileRepository: Repository<LeaderboardProfile>,

    @InjectRepository(LeaguePromotionEvent)
    private readonly promotionRepository: Repository<LeaguePromotionEvent>,

    private readonly profileService: LeaderboardProfileService,
    private readonly leagueConfigService: LeagueConfigService,
  ) {}

  async getLeaderboard(userId: string, query: LeaderboardQueryDto) {
    const currentProfile = await this.profileService.ensureProfile(userId);

    const definitions = await this.leagueConfigService.getDefinitions();

    const currentLeague = this.leagueConfigService.resolveLeague(
      currentProfile.totalXp,
      definitions,
    );

    const allProfiles = await this.profileRepository.find({
      order: {
        totalXp: 'DESC',
        updatedAt: 'ASC',
        id: 'ASC',
      },
    });

    const globalRanked = this.rankProfiles(allProfiles);

    const leagueProfiles = allProfiles.filter((profile) => {
      const league = this.leagueConfigService.resolveLeague(
        profile.totalXp,
        definitions,
      );

      return league.key === currentLeague.key;
    });

    const leagueRanked = this.rankProfiles(leagueProfiles);

    const scope = query.scope ?? LeaderboardScope.MY_LEAGUE;

    const selectedRanked =
      scope === LeaderboardScope.GLOBAL ? globalRanked : leagueRanked;

    const currentGlobalRank =
      globalRanked.find((entry) => entry.profile.userId === userId)?.rank ??
      null;

    const currentLeagueRank =
      leagueRanked.find((entry) => entry.profile.userId === userId)?.rank ??
      null;

    const scopeRank =
      selectedRanked.find((entry) => entry.profile.userId === userId)?.rank ??
      null;

    const leagueParticipantCount = leagueRanked.length;

    const zone = this.calculateZone(currentLeagueRank, leagueParticipantCount);

    const topPercent = this.calculateTopPercent(
      currentLeagueRank,
      leagueParticipantCount,
    );

    const nextLeague = this.leagueConfigService.getNextLeague(
      currentLeague,
      definitions,
    );

    const milestone = this.buildMilestone({
      totalXp: currentProfile.totalXp,
      currentLeague,
      nextLeague,
    });

    const podium = selectedRanked
      .slice(0, 3)
      .map((entry) => this.mapRankedProfile(entry, definitions, userId));

    const normalizedSearch = query.search?.trim().toLowerCase() ?? '';

    let listSource = normalizedSearch
      ? selectedRanked.filter((entry) => {
          const name = entry.profile.displayName.toLowerCase();

          const username = entry.profile.username?.toLowerCase() ?? '';

          return (
            name.includes(normalizedSearch) ||
            username.includes(normalizedSearch)
          );
        })
      : selectedRanked.filter((entry) => entry.rank > 3);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const total = listSource.length;

    listSource = listSource.slice((page - 1) * limit, page * limit);

    const activeBoost = this.getActiveBoost(currentProfile);

    return {
      scope,
      currentUser: {
        ...this.mapProfile(currentProfile, definitions, userId),
        scopeRank,
        globalRank: currentGlobalRank,
        leagueRank: currentLeagueRank,
        leagueParticipantCount,
        topPercent,
        zone,
        zoneLabel: this.getZoneLabel(zone),
        xpBoost: activeBoost,
      },
      podium,
      milestone,
      entries: listSource.map((entry) =>
        this.mapRankedProfile(entry, definitions, userId),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getMyStatus(userId: string) {
    const profile = await this.profileService.ensureProfile(userId);

    const definitions = await this.leagueConfigService.getDefinitions();

    const league = this.leagueConfigService.resolveLeague(
      profile.totalXp,
      definitions,
    );

    const nextLeague = this.leagueConfigService.getNextLeague(
      league,
      definitions,
    );

    return {
      ...this.mapProfile(profile, definitions, userId),
      milestone: this.buildMilestone({
        totalXp: profile.totalXp,
        currentLeague: league,
        nextLeague,
      }),
      xpBoost: this.getActiveBoost(profile),
    };
  }

  async getLeagueInformation() {
    const definitions = await this.leagueConfigService.getDefinitions();

    return {
      title: 'The League System',
      subtitle: 'Climb the tiers and become an Italian Master.',
      leagues: definitions.map((definition) =>
        this.leagueConfigService.toResponse(definition),
      ),
      rules: {
        promotion: {
          title: 'Promotion',
          description: 'Earn more XP to move up.',
          promotionZonePercentage: 20,
        },
        demotion: {
          title: 'Demotion',
          description:
            'Finish among the bottom five learners to enter the demotion zone.',
          bottomPositionCount: 5,
        },
      },
      waysToEarnXp: [
        'Complete video lessons',
        'Pass chapter quizzes',
        'Maintain answer streaks',
      ],
    };
  }

  getScoringGuide() {
    return {
      title: 'How to climb the Leaderboard!',
      subtitle: 'Learn the secrets to earning more points.',
      scoring: {
        basePoints: {
          title: 'Base Points',
          description: 'Earned for every correct answer.',
          xp: 10,
        },
        streakBonuses: [
          {
            streak: 3,
            xp: 5,
          },
          {
            streak: 5,
            xp: 10,
          },
        ],
        masteryBonus: {
          title: '100% Mastery',
          description: 'Perfect score on first attempt.',
          xp: 20,
        },
        speedBonus: {
          title: 'Speed Bonus',
          description: 'Finish the quiz in under 200 seconds.',
          maximumSeconds: 200,
          xp: 15,
        },
      },
      proTip:
        'Accuracy is better than speed. Careful answers can earn more XP than rushing.',
    };
  }

  async getPendingPromotion(userId: string) {
    await this.profileService.ensureProfile(userId);

    const event = await this.promotionRepository.findOne({
      where: {
        userId,
        isAcknowledged: false,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!event) {
      return {
        hasPendingPromotion: false,
        promotion: null,
      };
    }

    const definitions = await this.leagueConfigService.getDefinitions();

    const fromLeague = definitions.find(
      (definition) => definition.key === event.fromLeague,
    );

    const toLeague = definitions.find(
      (definition) => definition.key === event.toLeague,
    );

    if (!fromLeague || !toLeague) {
      throw new NotFoundException(
        'Promotion league configuration was not found.',
      );
    }

    return {
      hasPendingPromotion: true,
      promotion: {
        id: event.id,
        title: 'Congratulations!',
        badgeLabel: 'League Promotion',
        message: `You've been promoted to ${toLeague.name}!`,
        fromLeague: this.leagueConfigService.toResponse(fromLeague),
        toLeague: this.leagueConfigService.toResponse(toLeague),
        totalXp: event.totalXp,
        benefit:
          Number(event.xpBoostMultiplier) > 1
            ? {
                type: 'xp_boost',
                multiplier: Number(event.xpBoostMultiplier),
                expiresAt: event.xpBoostExpiresAt,
                remainingSeconds: event.xpBoostExpiresAt
                  ? Math.max(
                      0,
                      Math.floor(
                        (event.xpBoostExpiresAt.getTime() - Date.now()) / 1000,
                      ),
                    )
                  : 0,
              }
            : null,
        createdAt: event.createdAt,
      },
    };
  }

  async acknowledgePromotion(userId: string, promotionId: string) {
    const event = await this.promotionRepository.findOne({
      where: {
        id: promotionId,
        userId,
      },
    });

    if (!event) {
      throw new NotFoundException('Promotion event not found.');
    }

    if (!event.isAcknowledged) {
      event.isAcknowledged = true;
      event.acknowledgedAt = new Date();

      await this.promotionRepository.save(event);
    }

    return {
      message: 'Promotion acknowledged successfully.',
      promotionId: event.id,
      isAcknowledged: true,
    };
  }

  async getUserPreview(currentUserId: string, targetUserId: string) {
    const profile = await this.profileService.ensureProfile(targetUserId);

    const definitions = await this.leagueConfigService.getDefinitions();

    const league = this.leagueConfigService.resolveLeague(
      profile.totalXp,
      definitions,
    );

    return {
      userId: profile.userId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      streakDays: profile.streakDays,
      totalXp: profile.totalXp,
      league: this.leagueConfigService.toResponse(league),
      isCurrentUser: currentUserId === targetUserId,
      canChat: currentUserId !== targetUserId,
      chatTargetUserId: currentUserId !== targetUserId ? targetUserId : null,
    };
  }

  private rankProfiles(profiles: LeaderboardProfile[]): RankedProfile[] {
    return profiles.map((profile, index) => ({
      profile,
      rank: index + 1,
    }));
  }

  private mapRankedProfile(
    entry: RankedProfile,
    definitions: Awaited<ReturnType<LeagueConfigService['getDefinitions']>>,
    currentUserId: string,
  ) {
    return {
      ...this.mapProfile(entry.profile, definitions, currentUserId),
      rank: entry.rank,
    };
  }

  private mapProfile(
    profile: LeaderboardProfile,
    definitions: Awaited<ReturnType<LeagueConfigService['getDefinitions']>>,
    currentUserId: string,
  ) {
    const league = this.leagueConfigService.resolveLeague(
      profile.totalXp,
      definitions,
    );

    return {
      userId: profile.userId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      totalXp: profile.totalXp,
      streakDays: profile.streakDays,
      league: this.leagueConfigService.toResponse(league),
      isCurrentUser: profile.userId === currentUserId,
      canChat: profile.userId !== currentUserId,
    };
  }

  private buildMilestone(params: {
    totalXp: number;
    currentLeague: Awaited<ReturnType<LeagueConfigService['getDefinition']>>;
    nextLeague: Awaited<
      ReturnType<LeagueConfigService['getDefinition']>
    > | null;
  }) {
    if (!params.nextLeague) {
      return {
        currentLeague: this.leagueConfigService.toResponse(
          params.currentLeague,
        ),
        nextLeague: null,
        currentXp: params.totalXp,
        targetXp: null,
        xpRemaining: 0,
        progressPercentage: 100,
        message: 'You have reached the highest league!',
      };
    }

    const range = params.nextLeague.minXp - params.currentLeague.minXp;

    const completed = params.totalXp - params.currentLeague.minXp;

    const progressPercentage = Math.min(
      100,
      Math.max(0, Math.round((completed / range) * 100)),
    );

    const xpRemaining = Math.max(0, params.nextLeague.minXp - params.totalXp);

    return {
      currentLeague: this.leagueConfigService.toResponse(params.currentLeague),
      nextLeague: this.leagueConfigService.toResponse(params.nextLeague),
      currentXp: params.totalXp,
      targetXp: params.nextLeague.minXp,
      xpRemaining,
      progressPercentage,
      message: `Earn ${xpRemaining.toLocaleString()} more XP to reach ${params.nextLeague.name}!`,
    };
  }

  private calculateZone(rank: number | null, total: number): LeaderboardZone {
    if (!rank || total === 0) {
      return LeaderboardZone.SAFE;
    }

    const promotionCutoff = Math.max(1, Math.ceil(total * 0.2));

    if (rank <= promotionCutoff) {
      return LeaderboardZone.PROMOTION;
    }

    if (total > 5 && rank > total - 5) {
      return LeaderboardZone.DEMOTION;
    }

    return LeaderboardZone.SAFE;
  }

  private calculateTopPercent(
    rank: number | null,
    total: number,
  ): number | null {
    if (!rank || total === 0) {
      return null;
    }

    return Math.max(1, Math.ceil((rank / total) * 100));
  }

  private getZoneLabel(zone: LeaderboardZone): string {
    switch (zone) {
      case LeaderboardZone.PROMOTION:
        return 'Promotion Zone';

      case LeaderboardZone.DEMOTION:
        return 'Demotion Zone';

      default:
        return 'Safe Zone';
    }
  }

  private getActiveBoost(profile: LeaderboardProfile) {
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
}
