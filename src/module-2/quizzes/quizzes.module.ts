import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Lesson } from '../lessons/entities/lesson.entity';
import { AdminQuizzesController } from './controllers/admin-quizzes.controller';
import { QuizAcceptedAnswer } from './entities/quiz-accepted-answer.entity';
import { QuizMatchingPair } from './entities/quiz-matching-pair.entity';
import { QuizQuestionOption } from './entities/quiz-question-option.entity';
import { QuizQuestion } from './entities/quiz-question.entity';
import { QuizSequenceItem } from './entities/quiz-sequence-item.entity';
import { Quiz } from './entities/quiz.entity';
import { AdminQuizzesService } from './services/admin-quizzes.service';
import { QuizSession } from './entities/quiz-session.entity';
import { QuizAttemptAnswer } from './entities/quiz-attempt-answer.entity';
import { QuizAttemptAnswerItem } from './entities/quiz-attempt-answer-item.entity';
import { QuizSessionsController } from './controllers/quiz-sessions.controller';
import { QuizSessionsService } from './services/quiz-sessions.service';
import { QuizGradingService } from './services/quiz-grading.service';
import { ScoringModule } from '../scoring/scoring.module';
import { DailyChallengesModule } from '../daily-challenges/daily-challenges.module';
import { LeaderboardModule } from '../leaderboard/leaderboard.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Lesson,
      Quiz,
      QuizQuestion,
      QuizQuestionOption,
      QuizMatchingPair,
      QuizSequenceItem,
      QuizAcceptedAnswer,
      QuizSession,
      QuizAttemptAnswer,
      QuizAttemptAnswerItem,
    ]),
    ScoringModule,
    LeaderboardModule,
    DailyChallengesModule,
  ],
  controllers: [AdminQuizzesController, QuizSessionsController],
  providers: [AdminQuizzesService, QuizSessionsService, QuizGradingService],
  exports: [AdminQuizzesService, QuizSessionsService, QuizGradingService],
})
export class QuizzesModule {}
