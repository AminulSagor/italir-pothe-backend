import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Course } from '../module-2/courses/entities/course.entity';
import { User } from '../users/entities/user.entity';
import { Lesson } from '../module-2/lessons/entities/lesson.entity';
import { QuizSession } from '../module-2/quizzes/entities/quiz-session.entity';
import { ExamAttempt } from '../module-2/final-exam/entities/exam-attempt.entity';
import { VocabularyReviewSession } from '../module-2/lessons/entities/vocabulary-review-session.entity';
import { CourseDeviceAccessController } from './controllers/course-device-access.controller';
import { CourseDeviceAuthorization } from './entities/course-device-authorization.entity';
import { CourseDeviceChallenge } from './entities/course-device-challenge.entity';
import { CourseDeviceRequest } from './entities/course-device-request.entity';
import { CourseDeviceAccessService } from './services/course-device-access.service';
import { CourseDeviceAttestationService } from './services/course-device-attestation.service';
import { CourseDeviceAccessGuard } from './guards/course-device-access.guard';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Course,
      CourseDeviceAuthorization,
      CourseDeviceChallenge,
      CourseDeviceRequest,
      Lesson,
      QuizSession,
      ExamAttempt,
      VocabularyReviewSession,
    ]),
  ],
  controllers: [CourseDeviceAccessController],
  providers: [
    CourseDeviceAccessService,
    CourseDeviceAttestationService,
    CourseDeviceAccessGuard,
  ],
  exports: [CourseDeviceAccessService, CourseDeviceAccessGuard],
})
export class CourseDeviceAccessModule {}
