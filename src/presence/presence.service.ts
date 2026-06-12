
import { UserPresence } from '../chat/entities/user-presence.entity';
import { PresenceStatus } from '../chat/enums/chat.enums';
import {
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { validateUserId } from 'src/utils/common/userValidation';

@Injectable()
export class PresenceService {
  private readonly logger = new Logger(PresenceService.name);
  private readonly onlineWindowMinutes = 15;
  // Keep track of active socket connections in-memory
  private readonly socketConnections = new Map<string, Set<string>>();

  constructor(
    @InjectRepository(UserPresence)
    private readonly userPresenceRepository: Repository<UserPresence>,
  ) {}

  async handleSocketConnect(userId: string, socketId: string) {
    let connections = this.socketConnections.get(userId);
    if (!connections) {
      connections = new Set<string>();
      this.socketConnections.set(userId, connections);
    }
    connections.add(socketId);

    const now = new Date();
    const onlineUntil = new Date(now.getTime() + this.onlineWindowMinutes * 60 * 1000);

    const existing = await this.userPresenceRepository.findOne({ where: { userId } });

    const presenceData = {
      userId,
      status: PresenceStatus.ONLINE,
      lastHeartbeatAt: now,
      onlineUntil,
      lastSeenAt: now,
    };

    if (existing) {
      await this.userPresenceRepository.save({ ...existing, ...presenceData });
    } else {
      await this.userPresenceRepository.save(this.userPresenceRepository.create(presenceData));
    }
    this.logger.log(`Socket connected for user ${userId}. Total sockets: ${connections.size}`);
  }

  async handleSocketDisconnect(userId: string, socketId: string) {
    const connections = this.socketConnections.get(userId);
    if (connections) {
      connections.delete(socketId);
      this.logger.log(`Socket disconnected for user ${userId}. Remaining sockets: ${connections.size}`);
      if (connections.size === 0) {
        this.socketConnections.delete(userId);

        const now = new Date();
        const onlineUntil = new Date(now.getTime() + this.onlineWindowMinutes * 60 * 1000);

        const existing = await this.userPresenceRepository.findOne({ where: { userId } });
        if (existing) {
          existing.onlineUntil = onlineUntil;
          existing.lastSeenAt = now;
          await this.userPresenceRepository.save(existing);
        }
      }
    }
  }

  async isUserOnline(userId: string): Promise<boolean> {
    if (this.socketConnections.has(userId) && this.socketConnections.get(userId)!.size > 0) {
      return true;
    }
    const presence = await this.userPresenceRepository.findOne({ where: { userId } });
    if (!presence) {
      return false;
    }
    const now = new Date();
    return (
      presence.status === PresenceStatus.ONLINE &&
      !!presence.onlineUntil &&
      now < new Date(presence.onlineUntil)
    );
  }

  async getUserPresence(userId: string) {
    const isOnline = await this.isUserOnline(userId);
    const presence = await this.userPresenceRepository.findOne({ where: { userId } });
    return {
      isOnline,
      status: isOnline ? PresenceStatus.ONLINE : PresenceStatus.OFFLINE,
      lastSeenAt: presence ? presence.lastSeenAt : null,
    };
  }

  async heartbeat(userId: string) {
    validateUserId(userId);

    const now = new Date();
    const onlineUntil = new Date(now.getTime() + this.onlineWindowMinutes * 60 * 1000);

    const existing = await this.userPresenceRepository.findOne({ where: { userId } });

    const presenceData = {
      userId,
      status: PresenceStatus.ONLINE,
      lastHeartbeatAt: now,
      onlineUntil,
      lastSeenAt: now,
    };

    if (existing) {
      await this.userPresenceRepository.save({ ...existing, ...presenceData });
    } else {
      await this.userPresenceRepository.save(this.userPresenceRepository.create(presenceData));
    }

    return {
      success: true,
      message: 'Heartbeat Received',
      data: {
        userId,
        status: PresenceStatus.ONLINE,
        isOnline: true,
        lastHeartbeatAt: now,
        onlineUntil,
      },
    };
  }
}
