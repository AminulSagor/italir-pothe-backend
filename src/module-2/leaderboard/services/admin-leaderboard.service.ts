import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import {
  AdminLeaderboardQueryDto,
  CreateLeaderboardRewardDto,
  RewardHistoryQueryDto,
  UpdateRewardStatusDto,
} from '../dto/admin-leaderboard.dto';
import { LeaderboardProfile } from '../entities/leaderboard-profile.entity';
import { LeaderboardReward } from '../entities/leaderboard-reward.entity';
import {
  LeagueKey,
  LeaderboardRewardStatus,
  LeaderboardRewardType,
  LeaderboardSortOrder,
  LeaderboardXpSourceType,
} from '../types/leaderboard.type';
import { LeagueConfigService } from './league-config.service';
import { LeaderboardProfileService } from './leaderboard-profile.service';
import { LeaderboardXpService } from './leaderboard-xp.service';
import { ScoringService } from 'src/module-2/scoring/services/scoring.service';

@Injectable()
export class AdminLeaderboardService {
  constructor(
    @InjectRepository(LeaderboardProfile)
    private readonly profileRepository: Repository<LeaderboardProfile>,

    @InjectRepository(LeaderboardReward)
    private readonly rewardRepository: Repository<LeaderboardReward>,

    private readonly leagueConfigService: LeagueConfigService,
    private readonly profileService: LeaderboardProfileService,
    private readonly xpService: LeaderboardXpService,
    private readonly scoringService: ScoringService,
  ) {}

  async getDashboard(query: AdminLeaderboardQueryDto) {
    const definitions = await this.leagueConfigService.getDefinitions();

    const allProfiles = await this.profileRepository.find({
      order: {
        totalXp: 'DESC',
        updatedAt: 'ASC',
        id: 'ASC',
      },
    });

    const globalRankMap = new Map<string, number>();

    allProfiles.forEach((profile, index) => {
      globalRankMap.set(profile.userId, index + 1);
    });

    const leagueCards = definitions.map((definition) => ({
      ...this.leagueConfigService.toResponse(definition),
      totalMembers: allProfiles.filter((profile) => {
        const league = this.leagueConfigService.resolveLeague(
          profile.totalXp,
          definitions,
        );

        return league.key === definition.key;
      }).length,
    }));

    const topTen = allProfiles
      .slice(0, 10)
      .map((profile) =>
        this.mapProfile(
          profile,
          globalRankMap.get(profile.userId) ?? 0,
          definitions,
        ),
      );

    let filtered = [...allProfiles];

    if (query.league) {
      filtered = filtered.filter((profile) => {
        const league = this.leagueConfigService.resolveLeague(
          profile.totalXp,
          definitions,
        );

        return league.key === query.league;
      });
    }

    if (query.search?.trim()) {
      const search = query.search.trim().toLowerCase();

      filtered = filtered.filter((profile) => {
        return (
          profile.displayName.toLowerCase().includes(search) ||
          profile.username?.toLowerCase().includes(search)
        );
      });
    }

    const sortOrder = query.sortOrder ?? LeaderboardSortOrder.ASC;

    if (query.sortBy === 'displayName') {
      filtered.sort((left, right) => {
        const comparison = left.displayName.localeCompare(right.displayName);

        return sortOrder === LeaderboardSortOrder.ASC
          ? comparison
          : -comparison;
      });
    } else if (query.sortBy === 'totalXp') {
      filtered.sort((left, right) => {
        const comparison = left.totalXp - right.totalXp;

        return sortOrder === LeaderboardSortOrder.ASC
          ? comparison
          : -comparison;
      });
    } else {
      filtered.sort((left, right) => {
        const leftRank = globalRankMap.get(left.userId) ?? 0;

        const rightRank = globalRankMap.get(right.userId) ?? 0;

        const comparison = leftRank - rightRank;

        return sortOrder === LeaderboardSortOrder.ASC
          ? comparison
          : -comparison;
      });
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const total = filtered.length;

    const items = filtered
      .slice((page - 1) * limit, page * limit)
      .map((profile) =>
        this.mapProfile(
          profile,
          globalRankMap.get(profile.userId) ?? 0,
          definitions,
        ),
      );

    return {
      leagueCards,
      globalTopTen: topTen,
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async exportCsv(query: AdminLeaderboardQueryDto) {
    const definitions = await this.leagueConfigService.getDefinitions();

    let profiles = await this.profileRepository.find({
      order: {
        totalXp: 'DESC',
        updatedAt: 'ASC',
        id: 'ASC',
      },
    });

    if (query.league) {
      profiles = profiles.filter((profile) => {
        const league = this.leagueConfigService.resolveLeague(
          profile.totalXp,
          definitions,
        );

        return league.key === query.league;
      });
    }

    if (query.search?.trim()) {
      const search = query.search.trim().toLowerCase();

      profiles = profiles.filter(
        (profile) =>
          profile.displayName.toLowerCase().includes(search) ||
          profile.username?.toLowerCase().includes(search),
      );
    }

    const header = [
      'Rank',
      'User ID',
      'Name',
      'Username',
      'League',
      'Total XP',
      'Streak Days',
    ];

    const rows = profiles.map((profile, index) => {
      const league = this.leagueConfigService.resolveLeague(
        profile.totalXp,
        definitions,
      );

      return [
        index + 1,
        profile.userId,
        profile.displayName,
        profile.username ?? '',
        league.name,
        profile.totalXp,
        profile.streakDays,
      ];
    });

    return [header, ...rows]
      .map((row) =>
        row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','),
      )
      .join('\n');
  }

  async createReward(params: {
    adminUserId: string;
    userId: string;
    dto: CreateLeaderboardRewardDto;
  }) {
    const profile = await this.profileService.ensureProfile(params.userId);

    const definitions = await this.leagueConfigService.getDefinitions();

    const league = this.leagueConfigService.resolveLeague(
      profile.totalXp,
      definitions,
    );

    if (
      params.dto.rewardType === LeaderboardRewardType.XP &&
      !params.dto.xpAmount
    ) {
      throw new BadRequestException('xpAmount is required for an XP reward.');
    }

    let reward = this.rewardRepository.create({
      userId: params.userId,
      leagueKey: league.key,
      rewardType: params.dto.rewardType,
      title: params.dto.title.trim(),
      description: params.dto.description?.trim() || null,
      rewardValue: params.dto.rewardValue?.trim() || null,
      xpAmount: params.dto.xpAmount ?? null,
      status: LeaderboardRewardStatus.PENDING,
      issuedByUserId: params.adminUserId,
      issuedAt: new Date(),
    });

    reward = await this.rewardRepository.save(reward);

    let xpResult: unknown = null;

    if (reward.rewardType === LeaderboardRewardType.XP && reward.xpAmount) {
      const scoringResult = await this.scoringService.recordManualXp({
        userId: reward.userId,
        sourceId: `leaderboard-reward:${reward.id}`,
        amount: reward.xpAmount,
        reason: reward.title,
      });

      const leaderboardResult = await this.xpService.awardXp({
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

      xpResult = {
        scoring: scoringResult,
        leaderboard: leaderboardResult,
      };
    }

    return {
      message: 'Leaderboard reward created successfully.',
      reward,
      xpResult,
    };
  }

  async findRewardHistory(query: RewardHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.rewardRepository
      .createQueryBuilder('reward')
      .orderBy('reward.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('reward.status = :status', {
        status: query.status,
      });
    }

    if (query.rewardType) {
      queryBuilder.andWhere('reward.rewardType = :rewardType', {
        rewardType: query.rewardType,
      });
    }

    const [rewards, total] = await queryBuilder.getManyAndCount();

    const userIds = [...new Set(rewards.map((reward) => reward.userId))];

    const profiles = userIds.length
      ? await this.profileRepository.find({
          where: {
            userId: In(userIds),
          },
        })
      : [];

    const profileMap = new Map(
      profiles.map((profile) => [profile.userId, profile]),
    );

    return {
      items: rewards.map((reward) => {
        const profile = profileMap.get(reward.userId);

        return {
          id: reward.id,
          user: {
            id: reward.userId,
            displayName: profile?.displayName ?? 'Learner',
            username: profile?.username ?? null,
            avatarUrl: profile?.avatarUrl ?? null,
          },
          leagueKey: reward.leagueKey,
          rewardType: reward.rewardType,
          title: reward.title,
          description: reward.description,
          rewardValue: reward.rewardValue,
          xpAmount: reward.xpAmount,
          status: reward.status,
          issuedByUserId: reward.issuedByUserId,
          issuedAt: reward.issuedAt,
          createdAt: reward.createdAt,
          updatedAt: reward.updatedAt,
        };
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateRewardStatus(rewardId: string, dto: UpdateRewardStatusDto) {
    const reward = await this.rewardRepository.findOne({
      where: {
        id: rewardId,
      },
    });

    if (!reward) {
      throw new NotFoundException('Leaderboard reward not found.');
    }

    reward.status = dto.status;

    await this.rewardRepository.save(reward);

    return {
      message: 'Reward status updated successfully.',
      reward,
    };
  }

  private mapProfile(
    profile: LeaderboardProfile,
    rank: number,
    definitions: Awaited<ReturnType<LeagueConfigService['getDefinitions']>>,
  ) {
    const league = this.leagueConfigService.resolveLeague(
      profile.totalXp,
      definitions,
    );

    return {
      rank,
      userId: profile.userId,
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
      totalXp: profile.totalXp,
      streakDays: profile.streakDays,
      league: this.leagueConfigService.toResponse(league),
      canGiftReward: true,
    };
  }
}
