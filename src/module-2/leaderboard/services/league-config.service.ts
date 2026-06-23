import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { LeagueDefinition } from '../entities/league-definition.entity';
import { LeagueKey } from '../types/leaderboard.type';

const LEAGUE_SEEDS: Array<
  Pick<
    LeagueDefinition,
    | 'key'
    | 'name'
    | 'minXp'
    | 'maxXp'
    | 'iconKey'
    | 'themeKey'
    | 'sortOrder'
    | 'xpBoostMultiplier'
    | 'xpBoostDurationHours'
    | 'isActive'
  >
> = [
  {
    key: LeagueKey.BRONZE,
    name: 'Bronze League',
    minXp: 0,
    maxXp: 999,
    iconKey: 'bronze_medal',
    themeKey: 'bronze',
    sortOrder: 1,
    xpBoostMultiplier: '1.00',
    xpBoostDurationHours: 0,
    isActive: true,
  },
  {
    key: LeagueKey.SILVER,
    name: 'Silver League',
    minXp: 1000,
    maxXp: 4999,
    iconKey: 'silver_medal',
    themeKey: 'silver',
    sortOrder: 2,
    xpBoostMultiplier: '1.00',
    xpBoostDurationHours: 0,
    isActive: true,
  },
  {
    key: LeagueKey.GOLD,
    name: 'Gold League',
    minXp: 5000,
    maxXp: 9999,
    iconKey: 'gold_star',
    themeKey: 'gold',
    sortOrder: 3,
    xpBoostMultiplier: '2.00',
    xpBoostDurationHours: 48,
    isActive: true,
  },
  {
    key: LeagueKey.DIAMOND,
    name: 'Diamond League',
    minXp: 10000,
    maxXp: null,
    iconKey: 'diamond',
    themeKey: 'diamond',
    sortOrder: 4,
    xpBoostMultiplier: '3.00',
    xpBoostDurationHours: 72,
    isActive: true,
  },
];

@Injectable()
export class LeagueConfigService implements OnModuleInit {
  constructor(
    @InjectRepository(LeagueDefinition)
    private readonly leagueRepository: Repository<LeagueDefinition>,
  ) {}

  async onModuleInit(): Promise<void> {
    for (const seed of LEAGUE_SEEDS) {
      const existing = await this.leagueRepository.findOne({
        where: {
          key: seed.key,
        },
      });

      if (!existing) {
        await this.leagueRepository.save(this.leagueRepository.create(seed));
      }
    }
  }

  async getDefinitions(): Promise<LeagueDefinition[]> {
    return this.leagueRepository.find({
      where: {
        isActive: true,
      },
      order: {
        sortOrder: 'ASC',
      },
    });
  }

  async getDefinition(key: LeagueKey): Promise<LeagueDefinition> {
    const definition = await this.leagueRepository.findOne({
      where: {
        key,
        isActive: true,
      },
    });

    if (!definition) {
      throw new NotFoundException('League definition not found.');
    }

    return definition;
  }

  resolveLeague(
    totalXp: number,
    definitions: LeagueDefinition[],
  ): LeagueDefinition {
    const sorted = [...definitions].sort(
      (left, right) => left.sortOrder - right.sortOrder,
    );

    const matched = sorted.find(
      (definition) =>
        totalXp >= definition.minXp &&
        (definition.maxXp === null || totalXp <= definition.maxXp),
    );

    return matched ?? sorted[sorted.length - 1];
  }

  getNextLeague(
    current: LeagueDefinition,
    definitions: LeagueDefinition[],
  ): LeagueDefinition | null {
    return (
      definitions.find(
        (definition) => definition.sortOrder === current.sortOrder + 1,
      ) ?? null
    );
  }

  toResponse(definition: LeagueDefinition) {
    return {
      key: definition.key,
      name: definition.name,
      minXp: definition.minXp,
      maxXp: definition.maxXp,
      rangeLabel:
        definition.maxXp === null
          ? `${definition.minXp.toLocaleString()}+ XP`
          : `${definition.minXp.toLocaleString()}–${definition.maxXp.toLocaleString()} XP`,
      iconKey: definition.iconKey,
      themeKey: definition.themeKey,
      sortOrder: definition.sortOrder,
      benefit:
        Number(definition.xpBoostMultiplier) > 1
          ? {
              type: 'xp_boost',
              multiplier: Number(definition.xpBoostMultiplier),
              durationHours: definition.xpBoostDurationHours,
              durationDays: Math.ceil(definition.xpBoostDurationHours / 24),
            }
          : null,
    };
  }
}
