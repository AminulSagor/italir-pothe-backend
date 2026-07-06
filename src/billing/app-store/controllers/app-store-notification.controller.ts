import { Body, Controller, HttpCode, Post } from '@nestjs/common';

import { AppStoreServerNotificationDto } from '../dto/app-store-notification.dto';

import { AppStoreNotificationService } from '../services/app-store-notification.service';

@Controller('billing/app-store')
export class AppStoreNotificationController {
  constructor(
    private readonly notificationService: AppStoreNotificationService,
  ) {}

  @Post('notifications')
  @HttpCode(200)
  async receive(
    @Body()
    dto: AppStoreServerNotificationDto,
  ) {
    return this.notificationService.receive(dto.signedPayload);
  }
}
