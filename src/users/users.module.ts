import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { Otp } from './entities/otp.entity';
import { PresenceModule } from '../presence/presence.module';
import { FilesModule } from 'src/files/files.module';
import { SmsService } from 'src/common/services/sms.service';
import { EmailService } from 'src/common/services/email.service';
import { UserLearningActivityTimeEntry } from 'src/module-2/learning-activity/entities/user-learning-activity-time-entry.entity';
import { LeaderboardProfile } from 'src/module-2/leaderboard/entities/leaderboard-profile.entity';
import { UserStreak } from 'src/module-2/scoring/entities/user-streak.entity';
import { ExamAttempt } from 'src/module-2/final-exam/entities/exam-attempt.entity';
import { CourseEnrollment } from 'src/module-2/course-commerce/entities/course-enrollment.entity';
import { UserCourseEnrollment } from 'src/module-2/courses/entities/user-course-enrollment.entity';
import { UserCourseProgress } from 'src/module-2/progress/entities/user-course-progress.entity';
import { LearningActivityModule } from 'src/module-2/learning-activity/learning-activity.module';
import { AdminUserDirectoryService } from './admin-user-directory.service';
import { AdminUserDirectoryController } from './admin-user-directory.controller';
import { DeletedUserAudit } from './entities/deleted-user-audit.entity';
import { UserAccountDeletionService } from './user-account-deletion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Otp,
      DeletedUserAudit,
      UserLearningActivityTimeEntry,
      LeaderboardProfile,
      UserStreak,
      ExamAttempt,
      CourseEnrollment,
      UserCourseEnrollment,
      UserCourseProgress,
    ]),
    PresenceModule,
    FilesModule,
    LearningActivityModule,
  ],
  providers: [
    UsersService,
    UserAccountDeletionService,
    SmsService,
    EmailService,
    AdminUserDirectoryService,
  ],
  controllers: [UsersController, AdminUserDirectoryController],
  exports: [
    UsersService,
    UserAccountDeletionService,
    AdminUserDirectoryService,
  ],
})
export class UsersModule {}
