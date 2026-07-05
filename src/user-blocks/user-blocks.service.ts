import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserBlock } from './entities/user-block.entity';
import { User } from 'src/users/entities/user.entity';
import { BlockStatus } from './enums/block-status.enum';

@Injectable()
export class UserBlocksService {
  constructor(
    @InjectRepository(UserBlock)
    private readonly userBlockRepository: Repository<UserBlock>,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async blockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('You cannot block yourself');
    }

    const blockedUser = await this.userRepository.findOne({
      where: { id: blockedId },
      select: {
        id: true,
      },
    });

    if (!blockedUser) {
      throw new NotFoundException('User not found');
    }

    const existingBlock = await this.userBlockRepository.findOne({
      where: {
        blockerId,
        blockedId,
      },
    });

    if (existingBlock) {
      throw new ConflictException('User is already blocked');
    }

    const block = this.userBlockRepository.create({
      blockerId,
      blockedId,
    });

    try {
      const savedBlock = await this.userBlockRepository.save(block);

      return {
        message: 'User blocked successfully',
        data: savedBlock,
      };
    } catch (error) {
      if (this.isUniqueViolationError(error)) {
        throw new ConflictException('User is already blocked');
      }

      throw error;
    }
  }

  async unblockUser(blockerId: string, blockedId: string) {
    if (blockerId === blockedId) {
      throw new BadRequestException('Invalid unblock request');
    }

    const block = await this.userBlockRepository.findOne({
      where: {
        blockerId,
        blockedId,
      },
    });

    if (!block) {
      throw new NotFoundException('Block record not found');
    }

    await this.userBlockRepository.delete(block.id);

    return {
      message: 'User unblocked successfully',
    };
  }

  async getBlockStatus(currentUserId: string, otherUserId: string) {
    if (currentUserId === otherUserId) {
      return {
        status: BlockStatus.NONE,
      };
    }

    const blocks = await this.userBlockRepository.find({
      where: [
        {
          blockerId: currentUserId,
          blockedId: otherUserId,
        },
        {
          blockerId: otherUserId,
          blockedId: currentUserId,
        },
      ],
    });

    const blockedByMe = blocks.some(
      (block) =>
        block.blockerId === currentUserId && block.blockedId === otherUserId,
    );

    const blockedMe = blocks.some(
      (block) =>
        block.blockerId === otherUserId && block.blockedId === currentUserId,
    );

    if (blockedByMe && blockedMe) {
      return {
        status: BlockStatus.BOTH_BLOCKED,
      };
    }

    if (blockedByMe) {
      return {
        status: BlockStatus.BLOCKED_BY_ME,
      };
    }

    if (blockedMe) {
      return {
        status: BlockStatus.BLOCKED_ME,
      };
    }

    return {
      status: BlockStatus.NONE,
    };
  }

  async hasBlockBetween(
    userOneId: string,
    userTwoId: string,
  ): Promise<boolean> {
    if (userOneId === userTwoId) {
      return false;
    }

    const count = await this.userBlockRepository.count({
      where: [
        {
          blockerId: userOneId,
          blockedId: userTwoId,
        },
        {
          blockerId: userTwoId,
          blockedId: userOneId,
        },
      ],
    });

    return count > 0;
  }

  async assertCanMessage(senderId: string, receiverId: string): Promise<void> {
    const { status } = await this.getBlockStatus(senderId, receiverId);

    if (status === BlockStatus.BLOCKED_BY_ME) {
      throw new ForbiddenException(
        'You blocked this user. Unblock to send messages.',
      );
    }

    if (status === BlockStatus.BLOCKED_ME) {
      throw new ForbiddenException('You cannot message this user.');
    }

    if (status === BlockStatus.BOTH_BLOCKED) {
      throw new ForbiddenException('Messaging is blocked between these users.');
    }
  }

  async getMyBlockedUsers(currentUserId: string) {
    const blocks = await this.userBlockRepository.find({
      where: {
        blockerId: currentUserId,
      },
      relations: {
        blocked: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    const data = blocks.map((block) => {
      const blockedUser = block.blocked;

      return {
        /*
         * Always use the preserved UUID column.
         * The related User row may already be deleted.
         */
        blockedUserId: block.blockedId,

        fullName: blockedUser?.fullName ?? 'Deleted User',

        email: blockedUser?.email ?? null,

        phone: blockedUser?.phone ?? null,

        avatarUrl: blockedUser?.avatarUrl ?? null,

        isDeleted: blockedUser === null,

        blockedAt: block.createdAt,
      };
    });

    return {
      message: 'Blocked users fetched successfully',
      data,
    };
  }

  private isUniqueViolationError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === '23505'
    );
  }
}
