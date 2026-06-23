import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { User } from 'src/users/entities/user.entity';
import { LeaderboardProfile } from '../entities/leaderboard-profile.entity';

@Injectable()
export class LeaderboardProfileService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(LeaderboardProfile)
    private readonly profileRepository: Repository<LeaderboardProfile>,
  ) {}

  async ensureProfile(userId: string): Promise<LeaderboardProfile> {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found.');
    }

    const identity = this.extractUserIdentity(user);

    let profile = await this.profileRepository.findOne({
      where: {
        userId,
      },
    });

    if (!profile) {
      profile = this.profileRepository.create({
        userId,
        displayName: identity.displayName,
        username: identity.username,
        avatarUrl: identity.avatarUrl,
        totalXp: 0,
        streakDays: 0,
        xpBoostMultiplier: '1.00',
        xpBoostExpiresAt: null,
        lastActivityAt: null,
      });
    } else {
      profile.displayName = identity.displayName;
      profile.username = identity.username;
      profile.avatarUrl = identity.avatarUrl;
    }

    return this.profileRepository.save(profile);
  }

  async getProfile(userId: string): Promise<LeaderboardProfile> {
    return this.ensureProfile(userId);
  }

  extractUserIdentity(user: User) {
    const record = user as unknown as Record<string, unknown>;

    const firstName = this.readString(record, ['firstName', 'givenName']);

    const lastName = this.readString(record, ['lastName', 'familyName']);

    const composedName =
      [firstName, lastName].filter(Boolean).join(' ') || null;

    const email = this.readString(record, ['email']);

    const displayName =
      this.readString(record, ['fullName', 'displayName', 'name']) ??
      composedName ??
      email ??
      'Learner';

    const username = this.readString(record, ['username', 'handle']);

    const avatarUrl = this.readString(record, [
      'avatarUrl',
      'profileImageUrl',
      'profilePhotoUrl',
      'imageUrl',
      'photoUrl',
    ]);

    return {
      displayName,
      username,
      avatarUrl,
    };
  }

  private readString(
    record: Record<string, unknown>,
    keys: string[],
  ): string | null {
    for (const key of keys) {
      const value = record[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }
}
