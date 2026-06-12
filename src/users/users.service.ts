import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { UserPresence } from '../chat/entities/user-presence.entity';
import { PresenceStatus } from '../chat/enums/chat.enums';
import { PresenceService } from '../presence/presence.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private presenceService: PresenceService,
  ) {}

  async findByEmail(email: string) {
    return this.userRepository.findOne({ where: { email } });
  }

  async findAllUsersWithPresence() {
    const users = await this.userRepository.find();
    
    return Promise.all(
      users.map(async (user) => {
        const presence = await this.presenceService.getUserPresence(user.id);
        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isVerified: user.isVerified,
          isOnline: presence.isOnline,
          lastSeenAt: presence.lastSeenAt,
        };
      }),
    );
  }

  async deleteUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.role !== UserRole.USER) {
      throw new BadRequestException(
        'This ID does not belong to a standard user',
      );
    }

    await this.userRepository.remove(user);
    return { message: 'User deleted successfully' };
  }

  async deleteAdmin(id: string) {
    const admin = await this.userRepository.findOne({ where: { id } });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }
    if (admin.role !== UserRole.ADMIN) {
      throw new BadRequestException('This ID does not belong to an admin');
    }

    // Optional: Prevent deleting the last remaining admin
    const adminCount = await this.userRepository.count({
      where: { role: UserRole.ADMIN },
    });
    if (adminCount <= 1) {
      throw new BadRequestException('Cannot delete the last remaining admin');
    }

    await this.userRepository.remove(admin);
    return { message: 'Admin deleted successfully' };
  }
}
