import {
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { NotificationQueryDto } from '../dto/notification-query.dto';
import { NotificationsService } from '../services/notifications.service';

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get('my')
  async findMyNotifications(
    @Query() query: NotificationQueryDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.findMyNotifications(
      this.getUserId(request),
      query,
    );
  }

  @Patch(':notificationId/read')
  async markRead(
    @Param('notificationId') notificationId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.markRead(
      this.getUserId(request),
      notificationId,
    );
  }

  @Patch('read-all')
  async markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notificationsService.markAllRead(this.getUserId(request));
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return id;
  }
}
