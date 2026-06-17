import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { UserRole } from 'src/users/entities/user.entity';
import {
  BroadcastNotificationDto,
  SendMultipleUsersNotificationDto,
  SendUserNotificationDto,
} from '../dto/notification.dto';
import { NotificationsService } from '../services/notifications.service';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminNotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Post('user')
  async sendToUser(
    @Body() dto: SendUserNotificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.sendToUser(dto, this.getAdminId(request));
  }

  @Post('users')
  async sendToUsers(
    @Body() dto: SendMultipleUsersNotificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.sendToUsers(dto, this.getAdminId(request));
  }

  @Post('broadcast')
  async broadcast(
    @Body() dto: BroadcastNotificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.broadcast(dto, this.getAdminId(request));
  }

  private getAdminId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin not found');
    }

    return id;
  }
}
