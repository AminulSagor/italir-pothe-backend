import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AdminLeaderboardQueryDto } from '../dto/admin-leaderboard.dto';
import { LeaderboardProfile } from '../entities/leaderboard-profile.entity';
import { LeaderboardSortOrder } from '../types/leaderboard.type';
import { LeagueConfigService } from './league-config.service';

@Injectable()
export class AdminLeaderboardService {
  constructor(
    @InjectRepository(LeaderboardProfile)
    private readonly profileRepository: Repository<LeaderboardProfile>,

    private readonly leagueConfigService: LeagueConfigService,
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

    const globalTopTen = allProfiles
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

      filtered = filtered.filter(
        (profile) =>
          profile.displayName.toLowerCase().includes(search) ||
          profile.username?.toLowerCase().includes(search),
      );
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
      globalTopTen,
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
