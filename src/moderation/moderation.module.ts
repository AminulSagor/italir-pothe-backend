import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ModerationService } from './moderation.service';

import { User } from '../users/entities/user.entity';
import { Course } from '../module-2/courses/entities/course.entity';
import { UserCourseEnrollment } from '../module-2/courses/entities/user-course-enrollment.entity';
import { FilesModule } from 'src/files/files.module';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { ChatModule } from 'src/chat/chat.module';
import { CallsModule } from 'src/calls/calls.module';
import { ModerationReport } from 'src/moderation/entities/moderation-report.entity';
import { ReportVisualEvidence } from 'src/moderation/entities/report-visual-evidence.entity';
import { ModerationAction } from 'src/moderation/entities/moderation-action.entity';
import { ModerationController } from 'src/moderation/moderation.controller';

@Module({
  imports: [
    FilesModule,
    NotificationsModule,
    ChatModule,
    CallsModule,
    TypeOrmModule.forFeature([
      ModerationReport,
      ReportVisualEvidence,
      ModerationAction,
      User,
      Course,
      UserCourseEnrollment,
    ]),
  ],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
