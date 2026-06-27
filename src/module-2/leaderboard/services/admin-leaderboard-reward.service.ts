import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import { User } from 'src/users/entities/user.entity';
import {
  CreateLeaderboardRewardDto,
  DispatchLeaderboardRewardDto,
  RewardHistoryQueryDto,
  SendRewardUpdateDto,
  UpdateRewardStatusDto,
} from '../dto/admin-leaderboard.dto';
import { RewardShippingAddressDto } from '../dto/leaderboard.dto';
import { LeaderboardProfile } from '../entities/leaderboard-profile.entity';
import { LeaderboardRewardContent } from '../entities/leaderboard-reward-content.entity';
import { LeaderboardRewardFulfillment } from '../entities/leaderboard-reward-fulfillment.entity';
import { LeaderboardRewardShippingAddress } from '../entities/leaderboard-reward-shipping-address.entity';
import { LeaderboardRewardValue } from '../entities/leaderboard-reward-value.entity';
import { LeaderboardReward } from '../entities/leaderboard-reward.entity';
import {
  LeaderboardRewardNotificationType,
  LeaderboardRewardStatus,
  LeaderboardRewardType,
  LeaderboardSortOrder,
} from '../types/leaderboard.type';
import { LeagueConfigService } from './league-config.service';
import { LeaderboardProfileService } from './leaderboard-profile.service';
import { LeaderboardRewardNotificationService } from './leaderboard-reward-notification.service';
import { LeaderboardRewardNotification } from '../entities/leaderboard-reward-notification.entity';

@Injectable()
export class AdminLeaderboardRewardService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(LeaderboardProfile)
    private readonly profileRepository: Repository<LeaderboardProfile>,

    @InjectRepository(LeaderboardReward)
    private readonly rewardRepository: Repository<LeaderboardReward>,

    @InjectRepository(LeaderboardRewardContent)
    private readonly contentRepository: Repository<LeaderboardRewardContent>,

    @InjectRepository(LeaderboardRewardValue)
    private readonly valueRepository: Repository<LeaderboardRewardValue>,

    @InjectRepository(LeaderboardRewardFulfillment)
    private readonly fulfillmentRepository: Repository<LeaderboardRewardFulfillment>,

    @InjectRepository(LeaderboardRewardShippingAddress)
    private readonly shippingAddressRepository: Repository<LeaderboardRewardShippingAddress>,

    private readonly dataSource: DataSource,
    private readonly profileService: LeaderboardProfileService,
    private readonly leagueConfigService: LeagueConfigService,
    private readonly notificationService: LeaderboardRewardNotificationService,
  ) {}

  async getRewardConfiguration(userId: string) {
    const profile = await this.profileService.ensureProfile(userId);

    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });

    const definitions = await this.leagueConfigService.getDefinitions();

    const league = this.leagueConfigService.resolveLeague(
      profile.totalXp,
      definitions,
    );

    const rankedProfiles = await this.profileRepository.find({
      order: {
        totalXp: 'DESC',
        updatedAt: 'ASC',
        id: 'ASC',
      },
    });

    const rank = rankedProfiles.findIndex((item) => item.userId === userId) + 1;

    const topPercent =
      rankedProfiles.length > 0 && rank > 0
        ? Math.max(1, Math.ceil((rank / rankedProfiles.length) * 100))
        : null;

    return {
      user: {
        ...this.mapUser(user),
        displayName: profile.displayName,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        totalXp: profile.totalXp,
        streakDays: profile.streakDays,
        rank: rank || null,
        topPercent,
        league: this.leagueConfigService.toResponse(league),
      },
      assetTypes: this.getAssetTypeConfiguration(),
      systemActionDefaults: {
        sendPushNotification: true,
        playConfettiAnimation: true,
        requestShippingAddress: false,
      },
    };
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

    this.validateRewardPayload(params.dto);

    const isPhysical = this.isPhysicalReward(params.dto.rewardType);

    const sendPushNotification = params.dto.sendPushNotification ?? true;

    const playConfettiAnimation = params.dto.playConfettiAnimation ?? true;

    const requestShippingAddress = isPhysical
      ? (params.dto.requestShippingAddress ?? true)
      : false;

    const created = await this.dataSource.transaction(async (manager) => {
      const rewardRepository = manager.getRepository(LeaderboardReward);

      const contentRepository = manager.getRepository(LeaderboardRewardContent);

      const valueRepository = manager.getRepository(LeaderboardRewardValue);

      const fulfillmentRepository = manager.getRepository(
        LeaderboardRewardFulfillment,
      );

      let reward = rewardRepository.create({
        userId: params.userId,
        leagueKey: league.key,
        rewardType: params.dto.rewardType,
        title: params.dto.title.trim(),
        subtitle: params.dto.subtitle?.trim() ?? null,
        status: sendPushNotification
          ? LeaderboardRewardStatus.NOTIFIED
          : LeaderboardRewardStatus.PENDING,
        issuedByUserId: params.adminUserId,
        sendPushNotification,
        playConfettiAnimation,
        requestShippingAddress,
        seenAt: null,
        openedAt: null,
      });

      reward = await rewardRepository.save(reward);

      const content = contentRepository.create({
        rewardId: reward.id,
        congratulatoryNote: params.dto.congratulatoryNote?.trim() ?? null,
        earnedReason: params.dto.earnedReason?.trim() ?? null,
        imageUrl: params.dto.imageUrl?.trim() ?? null,
        fileUrl: params.dto.fileUrl?.trim() ?? null,
        relatedResourceId: params.dto.relatedResourceId ?? null,
      });

      const units = this.resolveRewardUnits(params.dto.rewardType);

      const value = valueRepository.create({
        rewardId: reward.id,
        primaryAmount: params.dto.primaryAmount ?? null,
        secondaryAmount: params.dto.secondaryAmount ?? null,
        primaryUnit: units.primaryUnit,
        secondaryUnit: units.secondaryUnit,
        appliedAt: null,
        applicationReference: null,
      });

      const fulfillment = fulfillmentRepository.create({
        rewardId: reward.id,
        addressRequestedAt: requestShippingAddress ? new Date() : null,
        addressReceivedAt: null,
        processingAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        lastNotificationAt: sendPushNotification ? new Date() : null,
        carrierName: null,
        trackingNumber: null,
        invoiceUrl: null,
      });

      await Promise.all([
        contentRepository.save(content),
        valueRepository.save(value),
        fulfillmentRepository.save(fulfillment),
      ]);

      return {
        reward,
        content,
        value,
        fulfillment,
      };
    });

    let giftNotification: LeaderboardRewardNotification | null = null;
    let addressNotification: LeaderboardRewardNotification | null = null;

    if (sendPushNotification) {
      giftNotification = await this.notificationService.queue({
        rewardId: created.reward.id,
        userId: created.reward.userId,
        type: LeaderboardRewardNotificationType.GIFT_AWARDED,
        title: 'Admin Giveaway Winner!',
        body:
          params.dto.congratulatoryNote?.trim() ||
          `Congratulations! You received ${created.reward.title}.`,
      });
    }

    if (requestShippingAddress) {
      addressNotification = await this.notificationService.queue({
        rewardId: created.reward.id,
        userId: created.reward.userId,
        type: LeaderboardRewardNotificationType.ADDRESS_REQUEST,
        title: 'Shipping address required',
        body: 'Open your reward and provide your Italian shipping address.',
      });
    }

    return {
      message: 'Leaderboard reward created successfully.',
      notificationMessage: sendPushNotification
        ? 'Gift notification queued successfully.'
        : null,
      reward: {
        id: created.reward.id,
        userId: created.reward.userId,
        leagueKey: created.reward.leagueKey,
        rewardType: created.reward.rewardType,
        title: created.reward.title,
        subtitle: created.reward.subtitle,
        status: created.reward.status,
        sendPushNotification,
        playConfettiAnimation,
        requestShippingAddress,
        createdAt: created.reward.createdAt,
      },
      content: created.content,
      value: created.value,
      notifications: {
        gift: giftNotification,
        addressRequest: addressNotification,
      },
    };
  }

  async getSummary() {
    const excluded = [
      LeaderboardRewardStatus.REVOKED,
      LeaderboardRewardStatus.CANCELLED,
    ];

    const [
      totalRewardsGiven,
      notified,
      addressPending,
      addressReceived,
      processing,
      dispatched,
      delivered,
      digitalClaimed,
    ] = await Promise.all([
      this.rewardRepository.count({
        where: {
          status: Not(In(excluded)),
        },
      }),

      this.rewardRepository.count({
        where: {
          status: LeaderboardRewardStatus.NOTIFIED,
        },
      }),

      this.rewardRepository.count({
        where: {
          status: LeaderboardRewardStatus.ADDRESS_PENDING,
        },
      }),

      this.rewardRepository.count({
        where: {
          status: LeaderboardRewardStatus.ADDRESS_RECEIVED,
        },
      }),

      this.rewardRepository.count({
        where: {
          status: LeaderboardRewardStatus.PROCESSING,
        },
      }),

      this.rewardRepository.count({
        where: {
          status: LeaderboardRewardStatus.DISPATCHED,
        },
      }),

      this.rewardRepository.count({
        where: {
          status: LeaderboardRewardStatus.DELIVERED,
        },
      }),

      this.rewardRepository
        .createQueryBuilder('reward')
        .where('reward.status IN (:...statuses)', {
          statuses: [
            LeaderboardRewardStatus.CLAIMED,
            LeaderboardRewardStatus.ISSUED,
          ],
        })
        .getCount(),
    ]);

    return {
      totalRewardsGiven,
      notified,
      addressPending,
      addressReceived,
      processing,
      dispatched,
      delivered,
      digitalClaimed,
    };
  }

  async findRewardHistory(query: RewardHistoryQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const sortBy = query.sortBy ?? 'createdAt';

    const sortOrder = query.sortOrder ?? LeaderboardSortOrder.DESC;

    const queryBuilder = this.rewardRepository
      .createQueryBuilder('reward')
      .leftJoinAndSelect('reward.content', 'content')
      .leftJoinAndSelect('reward.value', 'value')
      .leftJoinAndSelect('reward.fulfillment', 'fulfillment')
      .leftJoinAndSelect('reward.shippingAddress', 'shippingAddress')
      .leftJoin(LeaderboardProfile, 'profile', 'profile.userId = reward.userId')
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

    if (query.league) {
      queryBuilder.andWhere('reward.leagueKey = :league', {
        league: query.league,
      });
    }

    if (query.dateFrom) {
      queryBuilder.andWhere('reward.createdAt >= :dateFrom', {
        dateFrom: new Date(query.dateFrom),
      });
    }

    if (query.dateTo) {
      const dateTo = new Date(query.dateTo);

      dateTo.setUTCHours(23, 59, 59, 999);

      queryBuilder.andWhere('reward.createdAt <= :dateTo', {
        dateTo,
      });
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        `(
          reward.title ILIKE :search
          OR reward.subtitle ILIKE :search
          OR profile.displayName ILIKE :search
          OR profile.username ILIKE :search
          OR shippingAddress.fullName ILIKE :search
          OR shippingAddress.addressLine ILIKE :search
          OR fulfillment.trackingNumber ILIKE :search
        )`,
        {
          search,
        },
      );
    }

    const sortColumns = {
      createdAt: 'reward.createdAt',
      title: 'reward.title',
      status: 'reward.status',
      rewardType: 'reward.rewardType',
      recipient: 'profile.displayName',
    } as const;

    queryBuilder.orderBy(sortColumns[sortBy], sortOrder);

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
      items: rewards.map((reward) =>
        this.mapHistoryReward(reward, profileMap.get(reward.userId)),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findRewardById(rewardId: string) {
    const reward = await this.getRewardOrThrow(rewardId);

    const profile = await this.profileService.ensureProfile(reward.userId);

    const user = await this.userRepository.findOne({
      where: {
        id: reward.userId,
      },
    });

    const definitions = await this.leagueConfigService.getDefinitions();

    const league = this.leagueConfigService.resolveLeague(
      profile.totalXp,
      definitions,
    );

    const rankedProfiles = await this.profileRepository.find({
      order: {
        totalXp: 'DESC',
        updatedAt: 'ASC',
        id: 'ASC',
      },
    });

    const rank =
      rankedProfiles.findIndex((item) => item.userId === reward.userId) + 1;

    const notifications = await this.notificationService.findLatestForReward(
      reward.id,
    );

    return {
      reward: this.mapHistoryReward(reward, profile),
      recipient: {
        ...this.mapUser(user),
        displayName: profile.displayName,
        username: profile.username,
        avatarUrl: profile.avatarUrl,
        totalXp: profile.totalXp,
        rank: rank || null,
        league: this.leagueConfigService.toResponse(league),
      },
      shippingAddress: reward.shippingAddress
        ? this.mapShippingAddress(reward.shippingAddress)
        : null,
      fulfillment: reward.fulfillment
        ? {
            addressRequestedAt: reward.fulfillment.addressRequestedAt,
            addressReceivedAt: reward.fulfillment.addressReceivedAt,
            processingAt: reward.fulfillment.processingAt,
            dispatchedAt: reward.fulfillment.dispatchedAt,
            deliveredAt: reward.fulfillment.deliveredAt,
            lastNotificationAt: reward.fulfillment.lastNotificationAt,
            carrierName: reward.fulfillment.carrierName,
            trackingNumber: reward.fulfillment.trackingNumber,
            invoiceUrl: reward.fulfillment.invoiceUrl,
          }
        : null,
      notifications,
      availableActions: this.getAvailableActions(reward),
    };
  }

  async updateRewardStatus(rewardId: string, dto: UpdateRewardStatusDto) {
    const reward = await this.getRewardOrThrow(rewardId);

    this.assertStatusTransition(reward.status, dto.status);

    reward.status = dto.status;

    await this.rewardRepository.save(reward);

    await this.applyFulfillmentTimestamp(reward, dto.status);

    return {
      message: 'Reward status updated successfully.',
      rewardId: reward.id,
      status: reward.status,
    };
  }

  async requestShippingAddress(rewardId: string) {
    const reward = await this.getRewardOrThrow(rewardId);

    if (!this.isPhysicalReward(reward.rewardType)) {
      throw new BadRequestException(
        'Shipping addresses can only be requested for physical rewards.',
      );
    }

    if (
      reward.status === LeaderboardRewardStatus.DELIVERED ||
      reward.status === LeaderboardRewardStatus.REVOKED
    ) {
      throw new BadRequestException(
        'A shipping address can no longer be requested.',
      );
    }

    const now = new Date();

    reward.requestShippingAddress = true;

    if (!reward.openedAt) {
      reward.status = LeaderboardRewardStatus.NOTIFIED;
    } else {
      reward.status = LeaderboardRewardStatus.ADDRESS_PENDING;
    }

    await this.rewardRepository.save(reward);

    const fulfillment =
      reward.fulfillment ??
      this.fulfillmentRepository.create({
        rewardId: reward.id,
        addressRequestedAt: null,
        addressReceivedAt: null,
        processingAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        lastNotificationAt: null,
        carrierName: null,
        trackingNumber: null,
        invoiceUrl: null,
      });

    fulfillment.addressRequestedAt = now;

    fulfillment.lastNotificationAt = now;

    await this.fulfillmentRepository.save(fulfillment);

    const notification = await this.notificationService.queue({
      rewardId: reward.id,
      userId: reward.userId,
      type: LeaderboardRewardNotificationType.ADDRESS_REQUEST,
      title: 'Shipping address required',
      body: 'Please provide your Italian shipping address for your reward.',
    });

    return {
      message: 'Shipping address request queued successfully.',
      rewardId: reward.id,
      status: reward.status,
      notification,
    };
  }

  async sendUpdateNotification(rewardId: string, dto: SendRewardUpdateDto) {
    const reward = await this.getRewardOrThrow(rewardId);

    if (
      reward.status === LeaderboardRewardStatus.REVOKED ||
      reward.status === LeaderboardRewardStatus.CANCELLED
    ) {
      throw new BadRequestException(
        'Updates cannot be sent for a revoked reward.',
      );
    }

    const fulfillment =
      reward.fulfillment ??
      this.fulfillmentRepository.create({
        rewardId: reward.id,
        addressRequestedAt: null,
        addressReceivedAt: null,
        processingAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        lastNotificationAt: null,
        carrierName: null,
        trackingNumber: null,
        invoiceUrl: null,
      });

    fulfillment.lastNotificationAt = new Date();

    await this.fulfillmentRepository.save(fulfillment);

    const notification = await this.notificationService.queue({
      rewardId: reward.id,
      userId: reward.userId,
      type: LeaderboardRewardNotificationType.FULFILLMENT_UPDATE,
      title: dto.title?.trim() || 'Reward update',
      body:
        dto.body?.trim() ||
        `There is an update for your reward: ${reward.title}.`,
    });

    return {
      message: 'Reward update notification queued successfully.',
      notification,
    };
  }

  async updateShippingAddress(rewardId: string, dto: RewardShippingAddressDto) {
    const reward = await this.getRewardOrThrow(rewardId);

    if (!this.isPhysicalReward(reward.rewardType)) {
      throw new BadRequestException(
        'Shipping information is only supported for physical rewards.',
      );
    }

    if (
      reward.status === LeaderboardRewardStatus.DISPATCHED ||
      reward.status === LeaderboardRewardStatus.DELIVERED
    ) {
      throw new BadRequestException(
        'The shipping address can no longer be edited.',
      );
    }

    let address = reward.shippingAddress;

    if (address?.isLocked) {
      throw new BadRequestException('The shipping address is locked.');
    }

    if (!address) {
      address = this.shippingAddressRepository.create({
        rewardId: reward.id,
        fullName: dto.fullName.trim(),
        whatsappNumber: dto.whatsappNumber.trim(),
        addressLine: dto.addressLine.trim(),
        countryCode: dto.countryCode?.trim().toUpperCase() ?? 'IT',
        latitude: dto.latitude !== undefined ? dto.latitude.toFixed(7) : null,
        longitude:
          dto.longitude !== undefined ? dto.longitude.toFixed(7) : null,
        isLocked: false,
      });
    } else {
      address.fullName = dto.fullName.trim();

      address.whatsappNumber = dto.whatsappNumber.trim();

      address.addressLine = dto.addressLine.trim();

      address.countryCode = dto.countryCode?.trim().toUpperCase() ?? 'IT';

      address.latitude =
        dto.latitude !== undefined ? dto.latitude.toFixed(7) : null;

      address.longitude =
        dto.longitude !== undefined ? dto.longitude.toFixed(7) : null;
    }

    address = await this.shippingAddressRepository.save(address);

    const fulfillment =
      reward.fulfillment ??
      this.fulfillmentRepository.create({
        rewardId: reward.id,
        addressRequestedAt: null,
        addressReceivedAt: null,
        processingAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        lastNotificationAt: null,
        carrierName: null,
        trackingNumber: null,
        invoiceUrl: null,
      });

    fulfillment.addressReceivedAt = new Date();

    await this.fulfillmentRepository.save(fulfillment);

    reward.status = LeaderboardRewardStatus.ADDRESS_RECEIVED;

    await this.rewardRepository.save(reward);

    return {
      message: 'Reward shipping address updated successfully.',
      rewardId: reward.id,
      status: reward.status,
      shippingAddress: this.mapShippingAddress(address),
    };
  }

  async dispatchReward(rewardId: string, dto: DispatchLeaderboardRewardDto) {
    const reward = await this.getRewardOrThrow(rewardId);

    if (!this.isPhysicalReward(reward.rewardType)) {
      throw new BadRequestException('Only physical rewards can be dispatched.');
    }

    if (!reward.shippingAddress) {
      throw new BadRequestException(
        'A shipping address is required before dispatch.',
      );
    }

    if (reward.status === LeaderboardRewardStatus.DELIVERED) {
      throw new ConflictException('The reward has already been delivered.');
    }

    if (reward.status === LeaderboardRewardStatus.REVOKED) {
      throw new BadRequestException('A revoked reward cannot be dispatched.');
    }

    const fulfillment =
      reward.fulfillment ??
      this.fulfillmentRepository.create({
        rewardId: reward.id,
        addressRequestedAt: null,
        addressReceivedAt: null,
        processingAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        lastNotificationAt: null,
        carrierName: null,
        trackingNumber: null,
        invoiceUrl: null,
      });

    const now = new Date();

    fulfillment.processingAt ??= now;
    fulfillment.dispatchedAt = now;
    fulfillment.carrierName = dto.carrierName?.trim() ?? null;
    fulfillment.trackingNumber = dto.trackingNumber?.trim() ?? null;
    fulfillment.invoiceUrl = dto.invoiceUrl?.trim() ?? null;

    await this.fulfillmentRepository.save(fulfillment);

    reward.shippingAddress.isLocked = true;

    await this.shippingAddressRepository.save(reward.shippingAddress);

    reward.status = LeaderboardRewardStatus.DISPATCHED;

    await this.rewardRepository.save(reward);

    let notification: LeaderboardRewardNotification | null = null;

    if (dto.sendNotification ?? true) {
      notification = await this.notificationService.queue({
        rewardId: reward.id,
        userId: reward.userId,
        type: LeaderboardRewardNotificationType.REWARD_DISPATCHED,
        title: 'Your reward has been dispatched',
        body: fulfillment.trackingNumber
          ? `Your reward has been dispatched. Tracking number: ${fulfillment.trackingNumber}.`
          : 'Your reward has been dispatched.',
      });
    }

    return {
      message: 'Reward dispatched successfully.',
      rewardId: reward.id,
      status: reward.status,
      fulfillment: {
        dispatchedAt: fulfillment.dispatchedAt,
        carrierName: fulfillment.carrierName,
        trackingNumber: fulfillment.trackingNumber,
        invoiceUrl: fulfillment.invoiceUrl,
      },
      notification,
    };
  }

  async markDelivered(rewardId: string) {
    const reward = await this.getRewardOrThrow(rewardId);

    if (!this.isPhysicalReward(reward.rewardType)) {
      throw new BadRequestException(
        'Only physical rewards can be marked as delivered.',
      );
    }

    if (
      reward.status !== LeaderboardRewardStatus.DISPATCHED &&
      reward.status !== LeaderboardRewardStatus.DELIVERED
    ) {
      throw new BadRequestException(
        'The reward must be dispatched before delivery.',
      );
    }

    if (reward.status !== LeaderboardRewardStatus.DELIVERED) {
      reward.status = LeaderboardRewardStatus.DELIVERED;

      await this.rewardRepository.save(reward);

      const fulfillment =
        reward.fulfillment ??
        this.fulfillmentRepository.create({
          rewardId: reward.id,
          addressRequestedAt: null,
          addressReceivedAt: null,
          processingAt: null,
          dispatchedAt: null,
          deliveredAt: null,
          lastNotificationAt: null,
          carrierName: null,
          trackingNumber: null,
          invoiceUrl: null,
        });

      fulfillment.deliveredAt = new Date();

      await this.fulfillmentRepository.save(fulfillment);

      if (reward.shippingAddress) {
        reward.shippingAddress.isLocked = true;

        await this.shippingAddressRepository.save(reward.shippingAddress);
      }
    }

    const notification = await this.notificationService.queue({
      rewardId: reward.id,
      userId: reward.userId,
      type: LeaderboardRewardNotificationType.REWARD_DELIVERED,
      title: 'Reward delivered',
      body: 'Your reward delivery has been confirmed.',
    });

    return {
      message: 'Reward marked as delivered successfully.',
      rewardId: reward.id,
      status: LeaderboardRewardStatus.DELIVERED,
      notification,
    };
  }

  async revokeReward(rewardId: string) {
    const reward = await this.getRewardOrThrow(rewardId);

    if (
      [
        LeaderboardRewardStatus.CLAIMED,
        LeaderboardRewardStatus.ISSUED,
        LeaderboardRewardStatus.DISPATCHED,
        LeaderboardRewardStatus.DELIVERED,
      ].includes(reward.status)
    ) {
      throw new BadRequestException(
        'This reward has already been applied or dispatched and cannot be revoked automatically.',
      );
    }

    if (reward.status === LeaderboardRewardStatus.REVOKED) {
      return {
        message: 'Reward was already revoked.',
        rewardId: reward.id,
        status: reward.status,
      };
    }

    reward.status = LeaderboardRewardStatus.REVOKED;

    await this.rewardRepository.save(reward);

    const notification = await this.notificationService.queue({
      rewardId: reward.id,
      userId: reward.userId,
      type: LeaderboardRewardNotificationType.REWARD_REVOKED,
      title: 'Reward revoked',
      body: `The reward "${reward.title}" is no longer available.`,
    });

    return {
      message: 'Reward revoked successfully.',
      rewardId: reward.id,
      status: reward.status,
      notification,
    };
  }

  private async getRewardOrThrow(rewardId: string) {
    const reward = await this.rewardRepository.findOne({
      where: {
        id: rewardId,
      },
      relations: {
        content: true,
        value: true,
        fulfillment: true,
        shippingAddress: true,
      },
    });

    if (!reward) {
      throw new NotFoundException('Leaderboard reward not found.');
    }

    return reward;
  }

  private validateRewardPayload(dto: CreateLeaderboardRewardDto) {
    if (this.isPhysicalReward(dto.rewardType) && !dto.imageUrl?.trim()) {
      throw new BadRequestException(
        'imageUrl is required for a physical prize.',
      );
    }

    if (
      dto.rewardType === LeaderboardRewardType.DOWNLOADABLE_FILE &&
      !dto.fileUrl?.trim()
    ) {
      throw new BadRequestException(
        'fileUrl is required for a downloadable reward.',
      );
    }

    if (
      dto.rewardType === LeaderboardRewardType.COURSE_ACCESS &&
      !dto.relatedResourceId
    ) {
      throw new BadRequestException(
        'relatedResourceId is required for a course-access reward.',
      );
    }

    if (
      dto.rewardType === LeaderboardRewardType.CERTIFICATE &&
      !dto.relatedResourceId &&
      !dto.fileUrl?.trim()
    ) {
      throw new BadRequestException(
        'A certificate reward requires relatedResourceId or fileUrl.',
      );
    }

    if (
      dto.rewardType === LeaderboardRewardType.AI_PACKAGE &&
      (!dto.primaryAmount || !dto.secondaryAmount)
    ) {
      throw new BadRequestException(
        'AI Package requires token and minute quantities.',
      );
    }
  }

  private resolveRewardUnits(rewardType: LeaderboardRewardType) {
    switch (rewardType) {
      case LeaderboardRewardType.XP:
        return {
          primaryUnit: 'XP',
          secondaryUnit: null,
        };

      case LeaderboardRewardType.STREAK_FREEZE:
        return {
          primaryUnit: 'units',
          secondaryUnit: null,
        };

      case LeaderboardRewardType.CV_CREDITS:
        return {
          primaryUnit: 'credits',
          secondaryUnit: null,
        };

      case LeaderboardRewardType.AI_PACKAGE:
        return {
          primaryUnit: 'tokens',
          secondaryUnit: 'minutes',
        };

      default:
        return {
          primaryUnit: null,
          secondaryUnit: null,
        };
    }
  }

  private getAssetTypeConfiguration() {
    return [
      {
        rewardType: LeaderboardRewardType.PHYSICAL_PRIZE,
        label: 'Physical Prize',
        requiredFields: ['title', 'congratulatoryNote', 'imageUrl'],
        optionalFields: ['subtitle', 'earnedReason'],
        systemActions: {
          sendPushNotification: true,
          playConfettiAnimation: true,
          requestShippingAddress: true,
        },
      },
      {
        rewardType: LeaderboardRewardType.STREAK_FREEZE,
        label: 'Streak Freeze',
        requiredFields: ['title', 'primaryAmount'],
        primaryUnit: 'units',
      },
      {
        rewardType: LeaderboardRewardType.CV_CREDITS,
        label: 'CV Credits',
        requiredFields: ['title', 'primaryAmount'],
        primaryUnit: 'credits',
      },
      {
        rewardType: LeaderboardRewardType.AI_PACKAGE,
        label: 'AI Package',
        requiredFields: ['title', 'primaryAmount', 'secondaryAmount'],
        primaryUnit: 'tokens',
        secondaryUnit: 'minutes',
      },
      {
        rewardType: LeaderboardRewardType.XP,
        label: 'Bonus XP',
        requiredFields: ['title', 'primaryAmount'],
        primaryUnit: 'XP',
      },
      {
        rewardType: LeaderboardRewardType.COURSE_ACCESS,
        label: 'Course Unlock',
        requiredFields: ['title', 'relatedResourceId'],
      },
      {
        rewardType: LeaderboardRewardType.DOWNLOADABLE_FILE,
        label: 'Downloadable Guide',
        requiredFields: ['title', 'fileUrl'],
      },
      {
        rewardType: LeaderboardRewardType.CERTIFICATE,
        label: 'Certificate',
        requiredFields: ['title'],
        acceptedResourceFields: ['relatedResourceId', 'fileUrl'],
      },
      {
        rewardType: LeaderboardRewardType.BADGE,
        label: 'Badge',
        requiredFields: ['title'],
      },
    ];
  }

  private mapHistoryReward(
    reward: LeaderboardReward,
    profile?: LeaderboardProfile,
  ) {
    return {
      id: reward.id,
      recipient: {
        userId: reward.userId,
        displayName: profile?.displayName ?? 'Learner',
        username: profile?.username ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      },
      leagueKey: reward.leagueKey,
      rewardType: reward.rewardType,
      title: reward.title,
      subtitle: reward.subtitle,
      imageUrl: reward.content?.imageUrl ?? null,
      primaryAmount: reward.value?.primaryAmount ?? null,
      secondaryAmount: reward.value?.secondaryAmount ?? null,
      primaryUnit: reward.value?.primaryUnit ?? null,
      secondaryUnit: reward.value?.secondaryUnit ?? null,
      status: reward.status,
      displayStatus: this.getAdminStatusLabel(reward.status),
      awardedAt: reward.createdAt,
      dispatchDate: reward.fulfillment?.dispatchedAt ?? null,
      shippingAddress: reward.shippingAddress
        ? reward.shippingAddress.addressLine
        : reward.requestShippingAddress
          ? 'Waiting for confirmation...'
          : null,
      trackingNumber: reward.fulfillment?.trackingNumber ?? null,
    };
  }

  private getAdminStatusLabel(status: LeaderboardRewardStatus) {
    switch (status) {
      case LeaderboardRewardStatus.ADDRESS_RECEIVED:
        return 'ADDRESS RECEIVED';

      case LeaderboardRewardStatus.NOTIFIED:
      case LeaderboardRewardStatus.ADDRESS_PENDING:
        return 'NOTIFIED';

      case LeaderboardRewardStatus.DELIVERED:
      case LeaderboardRewardStatus.CLAIMED:
      case LeaderboardRewardStatus.ISSUED:
        return 'REWARDED';

      case LeaderboardRewardStatus.DISPATCHED:
        return 'DISPATCHED';

      case LeaderboardRewardStatus.REVOKED:
      case LeaderboardRewardStatus.CANCELLED:
        return 'REVOKED';

      default:
        return status.replaceAll('_', ' ').toUpperCase();
    }
  }

  private mapShippingAddress(address: LeaderboardRewardShippingAddress) {
    return {
      fullName: address.fullName,
      whatsappNumber: address.whatsappNumber,
      addressLine: address.addressLine,
      countryCode: address.countryCode,
      latitude: address.latitude,
      longitude: address.longitude,
      isLocked: address.isLocked,
      updatedAt: address.updatedAt,
    };
  }

  private getAvailableActions(reward: LeaderboardReward) {
    const physical = this.isPhysicalReward(reward.rewardType);

    return {
      canResendAddressRequest:
        physical &&
        !reward.shippingAddress &&
        ![
          LeaderboardRewardStatus.REVOKED,
          LeaderboardRewardStatus.DELIVERED,
        ].includes(reward.status),

      canEditAddress:
        physical &&
        Boolean(reward.shippingAddress) &&
        !reward.shippingAddress?.isLocked,

      canSendUpdateNotification: ![
        LeaderboardRewardStatus.REVOKED,
        LeaderboardRewardStatus.CANCELLED,
      ].includes(reward.status),

      canDispatch:
        physical &&
        Boolean(reward.shippingAddress) &&
        ![
          LeaderboardRewardStatus.DISPATCHED,
          LeaderboardRewardStatus.DELIVERED,
          LeaderboardRewardStatus.REVOKED,
        ].includes(reward.status),

      canMarkDelivered:
        physical && reward.status === LeaderboardRewardStatus.DISPATCHED,

      canRevoke: ![
        LeaderboardRewardStatus.CLAIMED,
        LeaderboardRewardStatus.ISSUED,
        LeaderboardRewardStatus.DISPATCHED,
        LeaderboardRewardStatus.DELIVERED,
        LeaderboardRewardStatus.REVOKED,
      ].includes(reward.status),

      canDownloadInvoice: Boolean(reward.fulfillment?.invoiceUrl),
    };
  }

  private assertStatusTransition(
    current: LeaderboardRewardStatus,
    next: LeaderboardRewardStatus,
  ) {
    if (current === next) {
      return;
    }

    const allowed = this.getAllowedTransitions(current);

    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Reward status cannot change from ${current} to ${next}.`,
      );
    }
  }

  private getAllowedTransitions(
    status: LeaderboardRewardStatus,
  ): LeaderboardRewardStatus[] {
    const transitions: Record<
      LeaderboardRewardStatus,
      LeaderboardRewardStatus[]
    > = {
      [LeaderboardRewardStatus.PENDING]: [
        LeaderboardRewardStatus.NOTIFIED,
        LeaderboardRewardStatus.REVOKED,
        LeaderboardRewardStatus.CANCELLED,
      ],

      [LeaderboardRewardStatus.NOTIFIED]: [
        LeaderboardRewardStatus.OPENED,
        LeaderboardRewardStatus.ADDRESS_PENDING,
        LeaderboardRewardStatus.REVOKED,
      ],

      [LeaderboardRewardStatus.OPENED]: [
        LeaderboardRewardStatus.ADDRESS_PENDING,
        LeaderboardRewardStatus.PROCESSING,
        LeaderboardRewardStatus.CLAIMED,
        LeaderboardRewardStatus.ISSUED,
        LeaderboardRewardStatus.REVOKED,
      ],

      [LeaderboardRewardStatus.ADDRESS_PENDING]: [
        LeaderboardRewardStatus.ADDRESS_RECEIVED,
        LeaderboardRewardStatus.REVOKED,
      ],

      [LeaderboardRewardStatus.ADDRESS_RECEIVED]: [
        LeaderboardRewardStatus.APPROVED,
        LeaderboardRewardStatus.PROCESSING,
        LeaderboardRewardStatus.DISPATCHED,
        LeaderboardRewardStatus.REVOKED,
      ],

      [LeaderboardRewardStatus.APPROVED]: [
        LeaderboardRewardStatus.PROCESSING,
        LeaderboardRewardStatus.DISPATCHED,
        LeaderboardRewardStatus.REVOKED,
      ],

      [LeaderboardRewardStatus.PROCESSING]: [
        LeaderboardRewardStatus.DISPATCHED,
        LeaderboardRewardStatus.CLAIMED,
        LeaderboardRewardStatus.ISSUED,
        LeaderboardRewardStatus.REVOKED,
      ],

      [LeaderboardRewardStatus.DISPATCHED]: [LeaderboardRewardStatus.DELIVERED],

      [LeaderboardRewardStatus.DELIVERED]: [],
      [LeaderboardRewardStatus.ISSUED]: [],
      [LeaderboardRewardStatus.CLAIMED]: [],
      [LeaderboardRewardStatus.REVOKED]: [],
      [LeaderboardRewardStatus.CANCELLED]: [],
      [LeaderboardRewardStatus.FAILED]: [
        LeaderboardRewardStatus.PROCESSING,
        LeaderboardRewardStatus.REVOKED,
      ],
    };

    return transitions[status];
  }

  private async applyFulfillmentTimestamp(
    reward: LeaderboardReward,
    status: LeaderboardRewardStatus,
  ) {
    const fulfillment =
      reward.fulfillment ??
      this.fulfillmentRepository.create({
        rewardId: reward.id,
        addressRequestedAt: null,
        addressReceivedAt: null,
        processingAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        lastNotificationAt: null,
        carrierName: null,
        trackingNumber: null,
        invoiceUrl: null,
      });

    const now = new Date();

    if (status === LeaderboardRewardStatus.ADDRESS_PENDING) {
      fulfillment.addressRequestedAt ??= now;
    }

    if (status === LeaderboardRewardStatus.ADDRESS_RECEIVED) {
      fulfillment.addressReceivedAt ??= now;
    }

    if (
      status === LeaderboardRewardStatus.PROCESSING ||
      status === LeaderboardRewardStatus.APPROVED
    ) {
      fulfillment.processingAt ??= now;
    }

    if (status === LeaderboardRewardStatus.DISPATCHED) {
      fulfillment.dispatchedAt ??= now;
    }

    if (status === LeaderboardRewardStatus.DELIVERED) {
      fulfillment.deliveredAt ??= now;
    }

    await this.fulfillmentRepository.save(fulfillment);
  }

  private isPhysicalReward(rewardType: LeaderboardRewardType) {
    return (
      rewardType === LeaderboardRewardType.PHYSICAL_GIFT ||
      rewardType === LeaderboardRewardType.PHYSICAL_PRIZE
    );
  }

  private mapUser(user: User | null) {
    const record = (user ?? {}) as Record<string, unknown>;

    const firstName = this.readString(record, ['firstName', 'givenName']);

    const lastName = this.readString(record, ['lastName', 'familyName']);

    const fullName =
      (this.readString(record, ['fullName', 'displayName', 'name']) ??
        [firstName, lastName].filter(Boolean).join(' ')) ||
      null;

    return {
      id: this.readString(record, ['id']),
      fullName,
      firstName,
      lastName,
      email: this.readString(record, ['email']),
      phone: this.readString(record, ['phone', 'phoneNumber']),
      level: this.readString(record, [
        'level',
        'currentLevel',
        'learningLevel',
      ]),
    };
  }

  private readString(record: Record<string, unknown>, keys: string[]) {
    for (const key of keys) {
      const value = record[key];

      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return null;
  }
}
