import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Course } from 'src/module-2/courses/entities/course.entity';
import {
  SubmitExamAnswerDto,
  SubmitExamAttemptDto,
  StartExamAttemptDto,
} from '../dto/exam-attempt.dto';
import { ExamAnswerItem } from '../entities/exam-answer-item.entity';
import { ExamAnswer } from '../entities/exam-answer.entity';
import { ExamAttempt } from '../entities/exam-attempt.entity';
import {
  ExamQuestion,
  FinalExamQuestionFormat,
} from '../entities/exam-question.entity';
import { ExamSection } from '../entities/exam-section.entity';
import { ExamTemplate } from '../entities/exam-template.entity';
import {
  ExamAnswerType,
  ExamAttemptStatus,
  ExamQuestionStatus,
  ExamReviewMode,
  ExamSectionStatus,
  ExamTemplateStatus,
} from '../types/final-exam.type';
import { QuizQuestionFormat } from 'src/module-2/quizzes/types/quiz-question-format.type';
import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { ProgressService } from 'src/module-2/progress/services/progress.service';
import { UserCourseProgress } from 'src/module-2/progress/entities/user-course-progress.entity';
import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';

interface UserSafeOption {
  id: string;
  optionText: string;
  sortOrder: number;
}

interface UserSafeQuestion {
  id: string;
  sectionId: string;
  questionFormat: FinalExamQuestionFormat;
  title: string | null;
  subtitle: string | null;
  prompt: string | null;
  promptBn: string | null;
  audioFileId: string | null;
  imageFileId: string | null;
  sortOrder: number;
  options: UserSafeOption[];
  pairs: {
    leftItems: { id: string; text: string; sortOrder: number }[];
    rightItems: { id: string; text: string; sortOrder: number }[];
  };
  sequenceItems: {
    id: string;
    text: string;
    sortOrder: number;
    isRequired: boolean;
  }[];
}

@Injectable()
export class ExamsService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(ExamTemplate)
    private readonly examTemplateRepository: Repository<ExamTemplate>,

    @InjectRepository(ExamSection)
    private readonly examSectionRepository: Repository<ExamSection>,

    @InjectRepository(ExamQuestion)
    private readonly examQuestionRepository: Repository<ExamQuestion>,

    @InjectRepository(ExamAttempt)
    private readonly examAttemptRepository: Repository<ExamAttempt>,

    @InjectRepository(ExamAnswer)
    private readonly examAnswerRepository: Repository<ExamAnswer>,

    @InjectRepository(ExamAnswerItem)
    private readonly examAnswerItemRepository: Repository<ExamAnswerItem>,

    @InjectRepository(UserCourseProgress)
    private readonly courseProgressRepository: Repository<UserCourseProgress>,

    private readonly dailyChallengesService: DailyChallengesService,
    private readonly progressService: ProgressService,
  ) {}

  async getMyCourseExamGateways(userId: string) {
    const progressRows = await this.courseProgressRepository.find({
      where: { userId },
      order: { lastActivityAt: 'DESC', updatedAt: 'DESC' },
    });

    const items: unknown[] = [];
    for (const progress of progressRows) {
      try {
        const gateway = await this.getExamGateway(progress.courseId, userId);
        items.push(gateway);
      } catch (error) {
        if (error instanceof NotFoundException) {
          continue;
        }
        throw error;
      }
    }

    return { items };
  }

  async getExamGateway(courseId: string, userId: string) {
    const course = await this.getCourseById(courseId);
    const exam = await this.getPublishedExamByCourse(course.id);

    const courseProgressPercent = await this.getCourseCompletionPercent(
      course.id,
      userId,
    );

    const isUnlocked = courseProgressPercent >= exam.unlockCompletionPercent;

    return {
      course: {
        id: course.id,
        title: course.title,
        subtitle: course.subtitle,
      },
      exam: {
        id: exam.id,
        title: exam.title,
        description: exam.description,
        totalDurationMinutes: exam.totalDurationMinutes,
        unlockCompletionPercent: exam.unlockCompletionPercent,
        resultNotice: exam.resultNotice,
        resultNoticeBn: exam.resultNoticeBn,
      },
      courseProgressPercent,
      isUnlocked,
      message: isUnlocked
        ? "You're ready! Final exam is unlocked."
        : `You need to complete ${exam.unlockCompletionPercent}% of the course to unlock the final exam.`,
    };
  }

  async startAttempt(dto: StartExamAttemptDto, userId: string) {
    const course = await this.getCourseById(dto.courseId);
    const exam = await this.getPublishedExamByCourse(course.id);

    const courseProgressPercent = await this.getCourseCompletionPercent(
      course.id,
      userId,
    );

    if (courseProgressPercent < exam.unlockCompletionPercent) {
      throw new ForbiddenException(
        `Final exam requires ${exam.unlockCompletionPercent}% course completion`,
      );
    }

    const existingAttempt = await this.examAttemptRepository.findOne({
      where: {
        userId,
        courseId: course.id,
        examTemplateId: exam.id,
        status: ExamAttemptStatus.IN_PROGRESS,
      },
    });

    if (existingAttempt) {
      return this.findAttempt(existingAttempt.id, userId);
    }

    const attempt = this.examAttemptRepository.create({
      userId,
      courseId: course.id,
      examTemplateId: exam.id,
      referenceCode: this.generateReferenceCode(course.title),
      status: ExamAttemptStatus.IN_PROGRESS,
      startedAt: new Date(),
      submittedAt: null,
      totalDurationSeconds: 0,
    });

    const savedAttempt = await this.examAttemptRepository.save(attempt);

    return this.findAttempt(savedAttempt.id, userId);
  }

  async findAttempt(attemptId: string, userId: string) {
    const attempt = await this.getUserAttempt(attemptId, userId);

    const exam = await this.examTemplateRepository.findOne({
      where: { id: attempt.examTemplateId },
      relations: {
        course: true,
        sections: {
          rule: true,
          questions: {
            options: true,
            pairs: true,
            sequenceItems: true,
            acceptedAnswers: true,
          },
        },
      },
      order: {
        sections: {
          sortOrder: 'ASC',
          questions: {
            sortOrder: 'ASC',
            options: {
              sortOrder: 'ASC',
            },
            pairs: {
              sortOrder: 'ASC',
            },
            sequenceItems: {
              correctOrder: 'ASC',
            },
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Final exam template not found');
    }

    return {
      attempt,
      exam: {
        id: exam.id,
        title: exam.title,
        courseTitle: exam.course?.title ?? null,
        totalDurationMinutes: exam.totalDurationMinutes,
        sections: exam.sections
          .filter((section) => section.status !== ExamSectionStatus.ARCHIVED)
          .map((section) => ({
            id: section.id,
            sectionType: section.sectionType,
            title: section.title,
            subtitle: section.subtitle,
            reviewMode: section.reviewMode,
            questionCount: section.questionCount,
            passingPercent: section.passingPercent,
            timeLimitSeconds: section.timeLimitSeconds,
            sortOrder: section.sortOrder,
            rule: section.rule,
            questions: section.questions
              .filter(
                (question) => question.status === ExamQuestionStatus.ACTIVE,
              )
              .map((question) => this.toUserSafeQuestion(question)),
          })),
      },
    };
  }

  async submitAnswer(
    attemptId: string,
    dto: SubmitExamAnswerDto,
    userId: string,
  ) {
    const attempt = await this.getUserAttempt(attemptId, userId);

    if (attempt.status !== ExamAttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('This exam attempt is already submitted');
    }

    const question = await this.examQuestionRepository.findOne({
      where: { id: dto.questionId },
      relations: {
        options: true,
        pairs: true,
        sequenceItems: true,
        acceptedAnswers: true,
        section: true,
      },
    });

    if (!question) {
      throw new NotFoundException('Exam question not found');
    }

    if (question.sectionId !== dto.sectionId) {
      throw new BadRequestException('Question does not belong to this section');
    }

    const grade = this.gradeAnswer(question, dto);

    await this.examAnswerRepository.delete({
      attemptId: attempt.id,
      questionId: question.id,
    });

    const answer = this.examAnswerRepository.create({
      attemptId: attempt.id,
      sectionId: dto.sectionId,
      questionId: dto.questionId,
      answerType: dto.answerType,
      selectedOptionId: dto.selectedOptionId ?? null,
      textAnswer:
        dto.booleanAnswer !== undefined && dto.booleanAnswer !== null
          ? String(dto.booleanAnswer)
          : (dto.textAnswer ?? null),
      audioFileId: dto.audioFileId ?? null,
      isCorrect: grade.isManual ? null : grade.isCorrect,
      score: String(grade.score),
      durationSeconds: dto.durationSeconds ?? 0,
      submittedAt: new Date(),
    });

    const savedAnswer = await this.examAnswerRepository.save(answer);

    if (dto.items?.length) {
      const answerItems = dto.items.map((item) =>
        this.examAnswerItemRepository.create({
          answerId: savedAnswer.id,
          selectedItemId: item.selectedItemId ?? null,
          matchedWithItemId: item.matchedWithItemId ?? null,
          textValue: item.textValue ?? null,
          sortOrder: item.sortOrder ?? 0,
        }),
      );

      await this.examAnswerItemRepository.save(answerItems);
    }

    return {
      answerId: savedAnswer.id,
      isManualReview: grade.isManual,
      isCorrect: grade.isManual ? null : grade.isCorrect,
      correctAnswer: grade.correctAnswer,
      score: grade.score,
    };
  }

  async submitAttempt(
    attemptId: string,
    dto: SubmitExamAttemptDto,
    userId: string,
  ) {
    const attempt = await this.getUserAttempt(attemptId, userId);

    if (attempt.status !== ExamAttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('This exam attempt is already submitted');
    }

    const hasManualReview = await this.hasManualReviewSections(
      attempt.examTemplateId,
    );

    attempt.status = hasManualReview
      ? ExamAttemptStatus.UNDER_REVIEW
      : ExamAttemptStatus.EVALUATED;
    attempt.submittedAt = new Date();
    attempt.totalDurationSeconds = dto.totalDurationSeconds ?? 0;

    const savedAttempt = await this.examAttemptRepository.save(attempt);

    await this.dailyChallengesService.recordInternalActivity({
      userId,
      activityType: LearningActivityType.FINAL_EXAM_SUBMITTED,
      sourceId: `final-exam-attempt:${savedAttempt.id}:submitted`,
      value: 1,
      clientActivityDate: dto.clientActivityDate,
    });

    if (savedAttempt.totalDurationSeconds > 0) {
      await this.dailyChallengesService.recordInternalActivity({
        userId,
        activityType: LearningActivityType.ACTIVE_LEARNING_MINUTES,
        sourceId: `final-exam-attempt:${savedAttempt.id}:active-minutes`,
        value: Math.max(1, Math.floor(savedAttempt.totalDurationSeconds / 60)),
        clientActivityDate: dto.clientActivityDate,
      });
    }

    return {
      message: hasManualReview
        ? 'Exam submitted successfully. Teacher review is pending.'
        : 'Exam submitted and evaluated successfully.',
      referenceCode: savedAttempt.referenceCode,
      status: savedAttempt.status,
      estimatedResult: hasManualReview ? '24 - 48 Hours' : 'Instant',
    };
  }

  async getResult(attemptId: string, userId: string) {
    const attempt = await this.examAttemptRepository.findOne({
      where: { id: attemptId, userId },
      relations: {
        review: {
          metric: true,
        },
      },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (
      attempt.status === ExamAttemptStatus.IN_PROGRESS ||
      attempt.status === ExamAttemptStatus.UNDER_REVIEW ||
      attempt.status === ExamAttemptStatus.SUBMITTED
    ) {
      return {
        status: attempt.status,
        referenceCode: attempt.referenceCode,
        resultReady: false,
        message: 'Result is not ready yet. Teacher review is in progress.',
      };
    }

    return {
      status: attempt.status,
      referenceCode: attempt.referenceCode,
      resultReady: true,
      review: attempt.review,
    };
  }

  private gradeAnswer(question: ExamQuestion, dto: SubmitExamAnswerDto) {
    const sectionReviewMode = question.section?.reviewMode;

    if (sectionReviewMode === ExamReviewMode.MANUAL) {
      return {
        isManual: true,
        isCorrect: false,
        correctAnswer: null,
        score: 0,
      };
    }

    if (
      question.questionFormat === QuizQuestionFormat.LISTENING_MCQ ||
      question.questionFormat === QuizQuestionFormat.WORD_TRANSLATION ||
      question.questionFormat === QuizQuestionFormat.IDENTIFY_IMAGE ||
      question.questionFormat === QuizQuestionFormat.FILL_IN_THE_BLANKS
    ) {
      const correctOption = question.options.find((option) => option.isCorrect);
      const isCorrect = Boolean(
        correctOption && correctOption.id === dto.selectedOptionId,
      );

      return {
        isManual: false,
        isCorrect,
        correctAnswer: correctOption?.optionText ?? null,
        score: isCorrect ? 1 : 0,
      };
    }

    if (question.questionFormat === QuizQuestionFormat.TRUE_FALSE) {
      const isCorrect = dto.booleanAnswer === question.correctBoolean;

      return {
        isManual: false,
        isCorrect,
        correctAnswer:
          question.correctBoolean === null
            ? null
            : String(question.correctBoolean),
        score: isCorrect ? 1 : 0,
      };
    }

    if (
      question.questionFormat === QuizQuestionFormat.WRITING_WORD_TRANSLATION
    ) {
      const answer = this.normalizeText(dto.textAnswer ?? '');
      const correctAnswer = question.acceptedAnswers.find((acceptedAnswer) => {
        const expected = this.normalizeText(acceptedAnswer.answerText);
        return expected === answer;
      });

      return {
        isManual: false,
        isCorrect: Boolean(correctAnswer),
        correctAnswer: question.acceptedAnswers[0]?.answerText ?? null,
        score: correctAnswer ? 1 : 0,
      };
    }

    if (
      question.questionFormat === QuizQuestionFormat.SENTENCE_TRANSLATION ||
      question.questionFormat === QuizQuestionFormat.LISTEN_AND_ASSEMBLE
    ) {
      const expected = question.sequenceItems
        .filter((item) => !item.isDecoy)
        .sort((a, b) => a.correctOrder - b.correctOrder)
        .map((item) => this.normalizeText(item.itemText));

      const submitted = (dto.items ?? [])
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
        .map((item) => this.normalizeText(item.textValue ?? ''));

      const isCorrect =
        expected.length === submitted.length &&
        expected.every((item, index) => item === submitted[index]);

      return {
        isManual: false,
        isCorrect,
        correctAnswer: expected.join(' '),
        score: isCorrect ? 1 : 0,
      };
    }

    if (question.questionFormat === QuizQuestionFormat.MATCH_THE_PAIR) {
      const submittedPairs = dto.items ?? [];

      const isCorrect =
        submittedPairs.length === question.pairs.length &&
        submittedPairs.every((item) => {
          if (!item.selectedItemId || !item.matchedWithItemId) return false;

          return question.pairs.some(
            (pair) =>
              pair.id === item.selectedItemId &&
              pair.id === item.matchedWithItemId,
          );
        });

      return {
        isManual: false,
        isCorrect,
        correctAnswer: question.pairs
          .map((pair) => `${pair.leftText} → ${pair.rightText}`)
          .join(', '),
        score: isCorrect ? 1 : 0,
      };
    }

    return {
      isManual: false,
      isCorrect: false,
      correctAnswer: null,
      score: 0,
    };
  }

  private toUserSafeQuestion(question: ExamQuestion): UserSafeQuestion {
    return {
      id: question.id,
      sectionId: question.sectionId,
      questionFormat: question.questionFormat,
      title: question.title,
      subtitle: question.subtitle,
      prompt: question.prompt,
      promptBn: question.promptBn,
      audioFileId: question.audioFileId,
      imageFileId: question.imageFileId,
      sortOrder: question.sortOrder,
      options: question.options.map((option) => ({
        id: option.id,
        optionText: option.optionText,
        sortOrder: option.sortOrder,
      })),
      pairs: {
        leftItems: question.pairs.map((pair) => ({
          id: pair.id,
          text: pair.leftText,
          sortOrder: pair.sortOrder,
        })),
        rightItems: this.shuffleArray(
          question.pairs.map((pair) => ({
            id: pair.id,
            text: pair.rightText,
            sortOrder: pair.sortOrder,
          })),
        ),
      },
      sequenceItems: this.shuffleArray(
        question.sequenceItems.map((item) => ({
          id: item.id,
          text: item.itemText,
          sortOrder: item.correctOrder,
          isRequired: !item.isDecoy,
        })),
      ),
    };
  }

  private async hasManualReviewSections(examTemplateId: string) {
    const count = await this.examSectionRepository.count({
      where: {
        examTemplateId,
        reviewMode: ExamReviewMode.MANUAL,
        status: ExamSectionStatus.ACTIVE,
      },
    });

    return count > 0;
  }

  private async getUserAttempt(attemptId: string, userId: string) {
    const attempt = await this.examAttemptRepository.findOne({
      where: { id: attemptId, userId },
    });

    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    return attempt;
  }

  private async getCourseById(courseId: string) {
    const course = await this.courseRepository.findOne({
      where: { id: courseId },
    });

    if (!course) {
      throw new NotFoundException('Course not found');
    }

    return course;
  }

  private async getPublishedExamByCourse(courseId: string) {
    const exam = await this.examTemplateRepository.findOne({
      where: {
        courseId,
        status: ExamTemplateStatus.PUBLISHED,
      },
    });

    if (!exam) {
      throw new NotFoundException('Published final exam not found');
    }

    return exam;
  }

  private async getCourseCompletionPercent(courseId: string, userId: string) {
    return this.progressService.getCourseCompletionPercent(userId, courseId);
  }

  private generateReferenceCode(courseTitle: string) {
    const courseCode = courseTitle
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 4)
      .toUpperCase();

    const random = Math.floor(1000 + Math.random() * 9000);

    return `EXAM-${courseCode || 'COURSE'}-${random}`;
  }

  private normalizeText(value: string) {
    return value
      .trim()
      .toLowerCase()
      .replace(/[.,!?'"`]/g, '')
      .replace(/\s+/g, ' ');
  }

  private shuffleArray<T>(items: T[]) {
    return [...items].sort(() => Math.random() - 0.5);
  }
}
