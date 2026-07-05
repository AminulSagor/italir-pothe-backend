import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Course } from 'src/module-2/courses/entities/course.entity';
import { CertificatesModule } from '../certificates/certificates.module';
import { AdminEvaluationController } from './controllers/admin-evaluation.controller';
import { AdminExamsController } from './controllers/admin-exams.controller';
import { ExamsController } from './controllers/exams.controller';
import { ExamAnswer } from './entities/exam-answer.entity';
import { ExamAttempt } from './entities/exam-attempt.entity';
import { ExamReviewMetric } from './entities/exam-review-metric.entity';
import { ExamReview } from './entities/exam-review.entity';
import { ExamSection } from './entities/exam-section.entity';
import { ExamTemplate } from './entities/exam-template.entity';
import { AdminExamsService } from './services/admin-exams.service';
import { ExamEvaluationService } from './services/exam-evaluation.service';
import { ExamsService } from './services/exams.service';
import { ExamAcceptedAnswer } from './entities/exam-accepted-answer.entity';
import { ExamAnswerItem } from './entities/exam-answer-item.entity';
import { ExamMatchingPair } from './entities/exam-matching-pair.entity';
import { ExamQuestionOption } from './entities/exam-question-option.entity';
import { ExamQuestion } from './entities/exam-question.entity';
import { ExamSectionRule } from './entities/exam-section-rule.entity';
import { ExamSequenceItem } from './entities/exam-sequence-item.entity';
import { DailyChallengesModule } from '../daily-challenges/daily-challenges.module';
import { ProgressModule } from '../progress/progress.module';
import { UserCourseProgress } from '../progress/entities/user-course-progress.entity';
import { UserLearningActivityTimeEntry } from '../learning-activity/entities/user-learning-activity-time-entry.entity';
import { FilesModule } from 'src/files/files.module';
import { NotificationsModule } from 'src/notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Course,
      UserCourseProgress,
      ExamAcceptedAnswer,
      ExamAnswerItem,
      ExamAnswer,
      ExamAttempt,
      ExamMatchingPair,
      ExamQuestionOption,
      ExamQuestion,
      ExamReviewMetric,
      ExamReview,
      ExamSectionRule,
      ExamSection,
      ExamSequenceItem,
      ExamTemplate,
      UserCourseProgress,
      UserLearningActivityTimeEntry,
    ]),
    CertificatesModule,
    DailyChallengesModule,
    ProgressModule,
    FilesModule,
    NotificationsModule,
  ],
  controllers: [
    AdminExamsController,
    AdminEvaluationController,
    ExamsController,
  ],
  providers: [AdminExamsService, ExamsService, ExamEvaluationService],
  exports: [AdminExamsService, ExamsService, ExamEvaluationService],
})
export class FinalExamModule {}
