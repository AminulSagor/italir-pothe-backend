import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

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
