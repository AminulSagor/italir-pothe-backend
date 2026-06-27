import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Not, Repository } from 'typeorm';

import {
  RewardShippingAddressDto,
  UserRewardHistoryQueryDto,
} from '../dto/leaderboard.dto';
import { LeaderboardRewardContent } from '../entities/leaderboard-reward-content.entity';
import { LeaderboardRewardFulfillment } from '../entities/leaderboard-reward-fulfillment.entity';
import { LeaderboardRewardShippingAddress } from '../entities/leaderboard-reward-shipping-address.entity';
import { LeaderboardReward } from '../entities/leaderboard-reward.entity';
import {
  LeaderboardRewardNotificationType,
  LeaderboardRewardStatus,
  LeaderboardRewardType,
  LeaderboardSortOrder,
} from '../types/leaderboard.type';
import { LeaderboardProfileService } from './leaderboard-profile.service';
import { LeaderboardRewardApplicationService } from './leaderboard-reward-application.service';
import { LeaderboardRewardNotificationService } from './leaderboard-reward-notification.service';

@Injectable()
export class LeaderboardRewardService {
  constructor(
    @InjectRepository(LeaderboardReward)
    private readonly rewardRepository: Repository<LeaderboardReward>,

    @InjectRepository(LeaderboardRewardFulfillment)
    private readonly fulfillmentRepository: Repository<LeaderboardRewardFulfillment>,

    @InjectRepository(LeaderboardRewardShippingAddress)
    private readonly shippingAddressRepository: Repository<LeaderboardRewardShippingAddress>,

    private readonly profileService: LeaderboardProfileService,
    private readonly applicationService: LeaderboardRewardApplicationService,
    private readonly notificationService: LeaderboardRewardNotificationService,
  ) {}

  async getDashboard(userId: string) {
    const profile = await this.profileService.ensureProfile(userId);

    const unseenRewardCount = await this.rewardRepository.count({
      where: {
        userId,
        seenAt: IsNull(),
        status: Not(
          In([
            LeaderboardRewardStatus.REVOKED,
            LeaderboardRewardStatus.CANCELLED,
            LeaderboardRewardStatus.FAILED,
          ]),
        ),
      },
    });

    const pendingChest = await this.rewardRepository
      .createQueryBuilder('reward')
      .leftJoinAndSelect('reward.content', 'content')
      .leftJoinAndSelect('reward.value', 'value')
      .leftJoinAndSelect('reward.fulfillment', 'fulfillment')
      .leftJoinAndSelect('reward.shippingAddress', 'shippingAddress')
      .where('reward.userId = :userId', {
        userId,
      })
      .andWhere('reward.openedAt IS NULL')
      .andWhere('reward.status NOT IN (:...excludedStatuses)', {
        excludedStatuses: [
          LeaderboardRewardStatus.REVOKED,
          LeaderboardRewardStatus.CANCELLED,
          LeaderboardRewardStatus.FAILED,
        ],
      })
      .orderBy('reward.createdAt', 'DESC')
      .getOne();

    const recentRewards = await this.rewardRepository.find({
      where: {
        userId,
        status: Not(
          In([
            LeaderboardRewardStatus.REVOKED,
            LeaderboardRewardStatus.CANCELLED,
          ]),
        ),
      },
      relations: {
        content: true,
        value: true,
        fulfillment: true,
        shippingAddress: true,
      },
      order: {
        createdAt: 'DESC',
      },
      take: 4,
    });

    return {
      user: {
        userId: profile.userId,
        displayName: profile.displayName,
      },
      hasUnseenReward: unseenRewardCount > 0,
      unseenRewardCount,
      hasPendingChest: Boolean(pendingChest),
      pendingChest: pendingChest
        ? this.mapChestReward(pendingChest, profile.displayName)
        : null,
      recentRewards: recentRewards.map((reward) => this.mapRewardCard(reward)),
    };
  }

  async findHistory(userId: string, query: UserRewardHistoryQueryDto) {
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
      .where('reward.userId = :userId', {
        userId,
      })
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

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        `(
          reward.title ILIKE :search
          OR reward.subtitle ILIKE :search
          OR content.earnedReason ILIKE :search
          OR content.congratulatoryNote ILIKE :search
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
    } as const;

    queryBuilder.orderBy(sortColumns[sortBy], sortOrder);

    const [rewards, total] = await queryBuilder.getManyAndCount();

    return {
      items: rewards.map((reward) => this.mapRewardCard(reward)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findById(userId: string, rewardId: string) {
    const reward = await this.getOwnedReward(userId, rewardId);

    if (!reward.seenAt) {
      reward.seenAt = new Date();

      await this.rewardRepository.save(reward);
    }

    return this.mapRewardDetail(reward);
  }

  async markSeen(userId: string, rewardId: string) {
    const reward = await this.getOwnedReward(userId, rewardId);

    if (!reward.seenAt) {
      reward.seenAt = new Date();

      await this.rewardRepository.save(reward);
    }

    return {
      message: 'Reward marked as seen successfully.',
      rewardId: reward.id,
      seenAt: reward.seenAt,
    };
  }

  async openReward(userId: string, rewardId: string) {
    const reward = await this.getOwnedReward(userId, rewardId);

    if (
      reward.status === LeaderboardRewardStatus.REVOKED ||
      reward.status === LeaderboardRewardStatus.CANCELLED
    ) {
      throw new BadRequestException('This reward is no longer available.');
    }

    const now = new Date();

    if (!reward.seenAt) {
      reward.seenAt = now;
    }

    if (!reward.openedAt) {
      reward.openedAt = now;
    }

    if (this.isPhysicalReward(reward.rewardType)) {
      reward.status = reward.requestShippingAddress
        ? LeaderboardRewardStatus.ADDRESS_PENDING
        : LeaderboardRewardStatus.PROCESSING;

      await this.rewardRepository.save(reward);

      return {
        message: 'Physical reward chest opened successfully.',
        reward: this.mapRewardDetail(reward),
        application: null,
      };
    }

    reward.status = LeaderboardRewardStatus.OPENED;

    await this.rewardRepository.save(reward);

    const application = await this.applicationService.applyReward({
      rewardId: reward.id,
      userId,
    });

    const updatedReward = await this.getOwnedReward(userId, rewardId);

    return {
      message: 'Reward chest opened successfully.',
      reward: this.mapRewardDetail(updatedReward),
      application,
    };
  }

  async saveShippingAddress(
    userId: string,
    rewardId: string,
    dto: RewardShippingAddressDto,
  ) {
    const reward = await this.getOwnedReward(userId, rewardId);

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
        'Shipping information can no longer be changed.',
      );
    }

    let shippingAddress = reward.shippingAddress;

    if (shippingAddress?.isLocked) {
      throw new BadRequestException('The shipping address is locked.');
    }

    if (!shippingAddress) {
      shippingAddress = this.shippingAddressRepository.create({
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
      shippingAddress.fullName = dto.fullName.trim();

      shippingAddress.whatsappNumber = dto.whatsappNumber.trim();

      shippingAddress.addressLine = dto.addressLine.trim();

      shippingAddress.countryCode =
        dto.countryCode?.trim().toUpperCase() ?? 'IT';

      shippingAddress.latitude =
        dto.latitude !== undefined ? dto.latitude.toFixed(7) : null;

      shippingAddress.longitude =
        dto.longitude !== undefined ? dto.longitude.toFixed(7) : null;
    }

    shippingAddress =
      await this.shippingAddressRepository.save(shippingAddress);

    let fulfillment = reward.fulfillment;

    if (!fulfillment) {
      fulfillment = this.fulfillmentRepository.create({
        rewardId: reward.id,
        addressRequestedAt: null,
        addressReceivedAt: new Date(),
        processingAt: null,
        dispatchedAt: null,
        deliveredAt: null,
        lastNotificationAt: null,
        carrierName: null,
        trackingNumber: null,
        invoiceUrl: null,
      });
    } else {
      fulfillment.addressReceivedAt = new Date();
    }

    await this.fulfillmentRepository.save(fulfillment);

    reward.status = LeaderboardRewardStatus.ADDRESS_RECEIVED;

    await this.rewardRepository.save(reward);

    await this.notificationService.queue({
      rewardId: reward.id,
      userId: reward.userId,
      type: LeaderboardRewardNotificationType.ADDRESS_RECEIVED,
      title: 'Shipping address received',
      body: 'Your shipping information has been received successfully.',
    });

    return {
      message: 'Shipping address saved successfully.',
      rewardId: reward.id,
      status: reward.status,
      shippingAddress: this.mapShippingAddress(shippingAddress),
    };
  }

  async confirmDelivery(userId: string, rewardId: string) {
    const reward = await this.getOwnedReward(userId, rewardId);

    if (!this.isPhysicalReward(reward.rewardType)) {
      throw new BadRequestException(
        'Delivery confirmation is only supported for physical rewards.',
      );
    }

    if (
      reward.status !== LeaderboardRewardStatus.DISPATCHED &&
      reward.status !== LeaderboardRewardStatus.DELIVERED
    ) {
      throw new BadRequestException('The reward has not been dispatched yet.');
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

    return {
      message: 'Reward delivery confirmed successfully.',
      rewardId: reward.id,
      status: LeaderboardRewardStatus.DELIVERED,
    };
  }

  async getDownload(userId: string, rewardId: string) {
    const reward = await this.getOwnedReward(userId, rewardId);

    if (
      reward.status === LeaderboardRewardStatus.REVOKED ||
      reward.status === LeaderboardRewardStatus.CANCELLED
    ) {
      throw new BadRequestException('This reward is no longer available.');
    }

    if (!reward.openedAt) {
      throw new BadRequestException('Open the reward before downloading it.');
    }

    if (!reward.content?.fileUrl) {
      throw new NotFoundException(
        'No downloadable file is attached to this reward.',
      );
    }

    return {
      rewardId: reward.id,
      title: reward.title,
      fileUrl: reward.content.fileUrl,
    };
  }

  private async getOwnedReward(userId: string, rewardId: string) {
    const reward = await this.rewardRepository.findOne({
      where: {
        id: rewardId,
        userId,
      },
      relations: {
        content: true,
        value: true,
        fulfillment: true,
        shippingAddress: true,
      },
    });

    if (!reward) {
      throw new NotFoundException('Reward not found.');
    }

    return reward;
  }

  private mapChestReward(reward: LeaderboardReward, displayName: string) {
    return {
      id: reward.id,
      title: reward.title,
      subtitle: reward.subtitle,
      rewardType: reward.rewardType,
      imageUrl: reward.content?.imageUrl ?? null,
      congratulatoryNote:
        reward.content?.congratulatoryNote ??
        `Congratulations, ${displayName}!`,
      headline: `YOU WON ${this.getRewardHeadline(reward)}!`,
      playConfettiAnimation: reward.playConfettiAnimation,
      requestShippingAddress: reward.requestShippingAddress,
      action: {
        type: 'open_chest',
        label: 'Open Chest',
      },
      awardedAt: reward.createdAt,
    };
  }

  private mapRewardCard(reward: LeaderboardReward) {
    return {
      id: reward.id,
      rewardType: reward.rewardType,
      title: reward.title,
      subtitle: reward.subtitle,
      imageUrl: reward.content?.imageUrl ?? null,
      iconKey: this.getRewardIconKey(reward.rewardType),
      status: reward.status,
      statusLabel: this.getUserStatusLabel(reward.status),
      primaryAmount: reward.value?.primaryAmount ?? null,
      secondaryAmount: reward.value?.secondaryAmount ?? null,
      primaryUnit: reward.value?.primaryUnit ?? null,
      secondaryUnit: reward.value?.secondaryUnit ?? null,
      isSeen: Boolean(reward.seenAt),
      isOpened: Boolean(reward.openedAt),
      awardedAt: reward.createdAt,
      action: this.getRewardAction(reward),
    };
  }

  private mapRewardDetail(reward: LeaderboardReward) {
    return {
      ...this.mapRewardCard(reward),
      congratulatoryNote: reward.content?.congratulatoryNote ?? null,
      earnedReason: reward.content?.earnedReason ?? null,
      fileUrl: reward.content?.fileUrl ?? null,
      relatedResourceId: reward.content?.relatedResourceId ?? null,
      playConfettiAnimation: reward.playConfettiAnimation,
      requestShippingAddress: reward.requestShippingAddress,
      openedAt: reward.openedAt,
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
            carrierName: reward.fulfillment.carrierName,
            trackingNumber: reward.fulfillment.trackingNumber,
            invoiceUrl: reward.fulfillment.invoiceUrl,
          }
        : null,
    };
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

  private getRewardAction(reward: LeaderboardReward) {
    if (
      reward.status === LeaderboardRewardStatus.REVOKED ||
      reward.status === LeaderboardRewardStatus.CANCELLED
    ) {
      return null;
    }

    if (!reward.openedAt) {
      return {
        type: 'open_chest',
        label: 'Open Chest',
      };
    }

    switch (reward.rewardType) {
      case LeaderboardRewardType.PHYSICAL_GIFT:
      case LeaderboardRewardType.PHYSICAL_PRIZE:
        if (!reward.shippingAddress) {
          return {
            type: 'shipping_address',
            label: 'Enter Shipping Address',
          };
        }

        return {
          type: 'track_delivery',
          label: 'View Delivery',
        };

      case LeaderboardRewardType.COURSE_ACCESS:
        return {
          type: 'start_course',
          label: 'Start Course',
          resourceId: reward.content?.relatedResourceId ?? null,
        };

      case LeaderboardRewardType.DOWNLOADABLE_FILE:
        return {
          type: 'download_file',
          label: 'Download PDF',
          fileUrl: reward.content?.fileUrl ?? null,
        };

      case LeaderboardRewardType.CERTIFICATE:
        return {
          type: 'view_certificate',
          label: 'View Certificate',
          resourceId: reward.content?.relatedResourceId ?? null,
          fileUrl: reward.content?.fileUrl ?? null,
        };

      default:
        return null;
    }
  }

  private getUserStatusLabel(status: LeaderboardRewardStatus) {
    switch (status) {
      case LeaderboardRewardStatus.CLAIMED:
        return 'CLAIMED';

      case LeaderboardRewardStatus.ISSUED:
        return 'ISSUED';

      case LeaderboardRewardStatus.DELIVERED:
        return 'DELIVERED';

      case LeaderboardRewardStatus.DISPATCHED:
        return 'DISPATCHED';

      case LeaderboardRewardStatus.ADDRESS_RECEIVED:
        return 'ADDRESS RECEIVED';

      case LeaderboardRewardStatus.ADDRESS_PENDING:
        return 'ADDRESS REQUIRED';

      case LeaderboardRewardStatus.REVOKED:
      case LeaderboardRewardStatus.CANCELLED:
        return 'REVOKED';

      default:
        return 'UNLOCKED';
    }
  }

  private getRewardIconKey(rewardType: LeaderboardRewardType) {
    switch (rewardType) {
      case LeaderboardRewardType.XP:
        return 'lightning';

      case LeaderboardRewardType.STREAK_FREEZE:
        return 'snowflake';

      case LeaderboardRewardType.CV_CREDITS:
        return 'cv_document';

      case LeaderboardRewardType.AI_PACKAGE:
        return 'ai_robot';

      case LeaderboardRewardType.COURSE_ACCESS:
        return 'graduation_cap';

      case LeaderboardRewardType.DOWNLOADABLE_FILE:
        return 'document';

      case LeaderboardRewardType.CERTIFICATE:
        return 'certificate';

      case LeaderboardRewardType.BADGE:
        return 'badge';

      default:
        return 'physical_prize';
    }
  }

  private getRewardHeadline(reward: LeaderboardReward) {
    if (this.isPhysicalReward(reward.rewardType)) {
      return `A ${reward.title.toUpperCase()}`;
    }

    return reward.title.toUpperCase();
  }

  private isPhysicalReward(rewardType: LeaderboardRewardType) {
    return (
      rewardType === LeaderboardRewardType.PHYSICAL_GIFT ||
      rewardType === LeaderboardRewardType.PHYSICAL_PRIZE
    );
  }
}
