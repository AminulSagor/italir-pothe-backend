import { Controller, Delete, Param, UseGuards, Req, Get, Query, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { PresenceService } from '../presence/presence.service';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly presenceService: PresenceService,
  ) {}
  private sanitize(user: any) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
    };
  }

  @Get('me')
  async getMe(@Req() req: any) {
    const baseUser = this.sanitize(req.user);
    const presence = await this.presenceService.getUserPresence(req.user.id);
    return {
      ...baseUser,
      presence,
    };
  }

  @Get('all')
  async getAllUsers() {
    return this.usersService.findAllUsersWithPresence();
  }

  @Get('search')
  async searchUser(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    const user = await this.usersService.findByEmail(email.toLowerCase());
    return user ? { found: true, user: this.sanitize(user) } : { found: false };
  }
  @Delete('user/:id')
  @Roles(UserRole.ADMIN)
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Delete('admin/:id')
  @Roles(UserRole.ADMIN)
  async deleteAdmin(@Param('id') id: string) {
    return this.usersService.deleteAdmin(id);
  }
}
