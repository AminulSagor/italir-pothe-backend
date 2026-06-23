import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ModerationReport } from './entities/moderation-report.entity';
import { ReportVisualEvidence } from './entities/report-visual-evidence.entity';
import { ModerationAction } from './entities/moderation-action.entity';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { User } from '../users/entities/user.entity';
import { Course } from '../module-2/courses/entities/course.entity';
import { UserCourseEnrollment } from '../module-2/courses/entities/user-course-enrollment.entity';

@Module({
  imports: [
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
