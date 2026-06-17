import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FirebaseModule } from 'src/firebase/firebase.module';
import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationEvent } from './entities/notification-event.entity';
import { UserNotification } from './entities/user-notification.entity';
import { NotificationsService } from './services/notifications.service';
import { UserStreak } from 'src/module-2/scoring/entities/user-streak.entity';
import { UserStreakReminder } from './entities/user-streak-reminder.entity';
import { StreakReminderService } from './services/streak-reminder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEvent,
      UserNotification,
      NotificationDelivery,
      UserStreak,
      UserStreakReminder,
    ]),
    FirebaseModule,
  ],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [NotificationsService, StreakReminderService],
  exports: [TypeOrmModule, NotificationsService, StreakReminderService],
})
export class NotificationsModule {}
