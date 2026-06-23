import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DevicesModule } from 'src/devices/devices.module';
import { File } from 'src/files/entities/file.entity';
import { FilesModule } from 'src/files/files.module';
import { FirebaseModule } from 'src/firebase/firebase.module';
import { UserStreak } from 'src/module-2/scoring/entities/user-streak.entity';
import { User } from 'src/users/entities/user.entity';

import { AdminNotificationsController } from './controllers/admin-notifications.controller';
import { NotificationsController } from './controllers/notifications.controller';
import { NotificationDelivery } from './entities/notification-delivery.entity';
import { NotificationEvent } from './entities/notification-event.entity';
import { ScheduledNotification } from './entities/scheduled-notification.entity';
import { UserNotification } from './entities/user-notification.entity';
import { UserStreakReminder } from './entities/user-streak-reminder.entity';
import { AdminNotificationHistoryService } from './services/admin-notification-history.service';
import { NotificationSchedulerService } from './services/notification-scheduler.service';
import { NotificationsService } from './services/notifications.service';
import { StreakReminderService } from './services/streak-reminder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      NotificationEvent,
      UserNotification,
      NotificationDelivery,
      UserStreak,
      UserStreakReminder,
      ScheduledNotification,
      User,
      File,
    ]),
    FirebaseModule,
    FilesModule,
    DevicesModule,
  ],
  controllers: [NotificationsController, AdminNotificationsController],
  providers: [
    NotificationsService,
    StreakReminderService,
    NotificationSchedulerService,
    AdminNotificationHistoryService,
  ],
  exports: [
    TypeOrmModule,
    NotificationsService,
    StreakReminderService,
    NotificationSchedulerService,
    AdminNotificationHistoryService,
  ],
})
export class NotificationsModule {}
