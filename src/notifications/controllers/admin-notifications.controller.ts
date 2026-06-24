import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { UserRole } from 'src/users/entities/user.entity';

import { AdminNotificationHistoryQueryDto } from '../dto/admin-notification-history-query.dto';
import {
  BroadcastNotificationDto,
  SendMultipleUsersNotificationDto,
  SendUserNotificationDto,
} from '../dto/notification.dto';
import { ScheduleNotificationDto } from '../dto/schedule-notification.dto';
import { AdminNotificationHistoryService } from '../services/admin-notification-history.service';
import { NotificationSchedulerService } from '../services/notification-scheduler.service';
import { NotificationsService } from '../services/notifications.service';

@Controller('admin/notifications')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminNotificationsController {
  constructor(
    private readonly notificationsService: NotificationsService,

    private readonly notificationSchedulerService: NotificationSchedulerService,

    private readonly notificationHistoryService: AdminNotificationHistoryService,
  ) {}

  @Post('user')
  async sendToUser(
    @Body() dto: SendUserNotificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationsService.sendToUser(dto, this.getAdminId(request));
  }

  @Post('users')
  async sendToUsers(
    @Body()
    dto: SendMultipleUsersNotificationDto,
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

  @Post('schedule')
  async schedule(
    @Body() dto: ScheduleNotificationDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.notificationSchedulerService.schedule(
      dto,
      this.getAdminId(request),
    );
  }

  @Get('history')
  async findHistory(
    @Query()
    query: AdminNotificationHistoryQueryDto,
  ) {
    return this.notificationHistoryService.findAll(query);
  }

  @Get('history/:id')
  async findHistoryItem(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.notificationHistoryService.findOne(id);
  }

  @Get('scheduled')
  async findScheduledNotifications() {
    return this.notificationSchedulerService.findAll();
  }

  @Get('scheduled/:id')
  async findScheduledNotification(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.notificationSchedulerService.findOne(id);
  }

  @Patch('scheduled/:id/cancel')
  async cancelScheduledNotification(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.notificationSchedulerService.cancel(id);
  }

  @Delete('scheduled/:id')
  async deleteScheduledNotification(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.notificationSchedulerService.deleteScheduled(id);
  }

  private getAdminId(request: AuthenticatedRequest): string {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated admin not found');
    }

    return id;
  }
}
