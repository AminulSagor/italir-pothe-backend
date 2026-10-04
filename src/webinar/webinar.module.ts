import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { File } from 'src/files/entities/file.entity';
import { CourseEnrollment } from 'src/module-2/course-commerce/entities/course-enrollment.entity';
import { Course } from 'src/module-2/courses/entities/course.entity';
import { UserCourseEnrollment } from 'src/module-2/courses/entities/user-course-enrollment.entity';
import { NotificationEvent } from 'src/notifications/entities/notification-event.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';
import { FilesModule } from 'src/files/files.module';
import { User } from 'src/users/entities/user.entity';
import { AdminWebinarsController } from './controllers/admin-webinars.controller';
import { WebinarsController } from './controllers/webinars.controller';
import { WebinarAudienceCourse } from './entities/webinar-audience-course.entity';
import { WebinarChatMessage } from './entities/webinar-chat-message.entity';
import { WebinarParticipant } from './entities/webinar-participant.entity';
import { WebinarSpeakerRequest } from './entities/webinar-speaker-request.entity';
import { Webinar } from './entities/webinar.entity';
import { WebinarGateway } from './gateways/webinar.gateway';
import { AgoraTokenService } from './services/agora-token.service';
import { WebinarAudienceService } from './services/webinar-audience.service';
import { WebinarNotificationService } from './services/webinar-notification.service';
import { WebinarsService } from './services/webinars.service';
import { UserBlocksModule } from 'src/user-blocks/user-blocks.module';
import { ConfigModule } from '@nestjs/config';
import { MessageKeywordScannerService } from 'src/chat/moderation/message-keyword-scanner.service';
import { MessageModerationLlmService } from 'src/chat/moderation/message-moderation-llm.service';
import { MessageModerationService } from 'src/chat/moderation/message-moderation.service';

@Module({
  imports: [
    ConfigModule,
    UserBlocksModule,
    FilesModule,
    NotificationsModule,
    TypeOrmModule.forFeature([
      Webinar,
      WebinarAudienceCourse,
      WebinarChatMessage,
      WebinarParticipant,
      WebinarSpeakerRequest,
      User,
      File,
      Course,
      CourseEnrollment,
      UserCourseEnrollment,
      NotificationEvent,
    ]),
  ],
  controllers: [AdminWebinarsController, WebinarsController],
  providers: [
    WebinarsService,
    AgoraTokenService,
    WebinarGateway,
    WebinarAudienceService,
    WebinarNotificationService,
    MessageKeywordScannerService,
    MessageModerationLlmService,
    MessageModerationService,
  ],
  exports: [WebinarsService, AgoraTokenService],
})
export class WebinarModule {}
