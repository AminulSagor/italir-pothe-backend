import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Not, Repository } from 'typeorm';

import { Lesson, LessonStatus } from '../../lessons/entities/lesson.entity';
import {
  AdminCourseQueryDto,
  CreateCourseDto,
  UpdateCourseDto,
} from '../dto/course.dto';
import { Course, CourseStatus } from '../entities/course.entity';
import { CourseChapter } from 'src/module-2/syllabus/entities/course-chapter.entity';
import { QuizAcceptedAnswer } from 'src/module-2/quizzes/entities/quiz-accepted-answer.entity';
import { QuizMatchingPair } from 'src/module-2/quizzes/entities/quiz-matching-pair.entity';
import { QuizSequenceItem } from 'src/module-2/quizzes/entities/quiz-sequence-item.entity';
import { QuizSession } from 'src/module-2/quizzes/entities/quiz-session.entity';
import { QuizAttemptAnswer } from 'src/module-2/quizzes/entities/quiz-attempt-answer.entity';
import { QuizAttemptAnswerItem } from 'src/module-2/quizzes/entities/quiz-attempt-answer-item.entity';
import { LessonVocabulary } from 'src/module-2/lessons/entities/lesson-vocabulary.entity';
import { UserVocabularyProgress } from 'src/module-2/lessons/entities/user-vocabulary-progress.entity';
import { VocabularyReviewSession } from 'src/module-2/lessons/entities/vocabulary-review-session.entity';
import { VocabularyReviewSessionItem } from 'src/module-2/lessons/entities/vocabulary-review-session-item.entity';
import { ExamTemplate } from 'src/module-2/final-exam/entities/exam-template.entity';
import { ExamSection } from 'src/module-2/final-exam/entities/exam-section.entity';
import { ExamSectionRule } from 'src/module-2/final-exam/entities/exam-section-rule.entity';
import { ExamQuestion } from 'src/module-2/final-exam/entities/exam-question.entity';
import { ExamQuestionOption } from 'src/module-2/final-exam/entities/exam-question-option.entity';
import { ExamAcceptedAnswer } from 'src/module-2/final-exam/entities/exam-accepted-answer.entity';
import { ExamMatchingPair } from 'src/module-2/final-exam/entities/exam-matching-pair.entity';
import { ExamSequenceItem } from 'src/module-2/final-exam/entities/exam-sequence-item.entity';
import { ExamAttempt } from 'src/module-2/final-exam/entities/exam-attempt.entity';
import { ExamAnswer } from 'src/module-2/final-exam/entities/exam-answer.entity';
import { ExamAnswerItem } from 'src/module-2/final-exam/entities/exam-answer-item.entity';
import { ExamReview } from 'src/module-2/final-exam/entities/exam-review.entity';
import { ExamReviewMetric } from 'src/module-2/final-exam/entities/exam-review-metric.entity';
import { Certificate } from 'src/module-2/certificates/entities/certificate.entity';
import { QuizQuestionOption } from 'src/module-2/quizzes/entities/quiz-question-option.entity';
import { QuizQuestion } from 'src/module-2/quizzes/entities/quiz-question.entity';
import { Quiz } from 'src/module-2/quizzes/entities/quiz.entity';
import { UserLessonProgress } from 'src/module-2/progress/entities/user-lesson-progress.entity';
import { UserCourseProgress } from 'src/module-2/progress/entities/user-course-progress.entity';

@Injectable()
export class AdminCoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CourseChapter)
    private readonly courseChapterRepository: Repository<CourseChapter>,

    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,

    private readonly dataSource: DataSource,
  ) {}

  async createCourse(dto: CreateCourseDto) {
    this.validatePricing(dto.isFree ?? true, dto.price);

    const slug = this.createSlug(dto.slug || dto.title);
    await this.ensureCourseSlugIsAvailable(slug);

    const course = this.courseRepository.create({
      title: dto.title,
      subtitle: dto.subtitle ?? null,
      description: dto.description ?? null,
      slug,
      isFree: dto.isFree ?? true,
      price: dto.isFree === false ? this.formatPrice(dto.price) : null,
      couponCode: dto.couponCode ?? null,
      finalExamTemplateId: dto.finalExamTemplateId ?? null,
      status: dto.status ?? CourseStatus.DRAFT,
      publishedAt: dto.status === CourseStatus.PUBLISHED ? new Date() : null,
    });

    const savedCourse = await this.courseRepository.save(course);

    return this.findCourseById(savedCourse.id);
  }

  async findAllCourses(query: AdminCourseQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const queryBuilder = this.courseRepository
      .createQueryBuilder('course')
      .orderBy('course.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.statuses?.length) {
      queryBuilder.andWhere('course.status IN (:...statuses)', {
        statuses: query.statuses,
      });
    }

    if (query.search?.trim()) {
      queryBuilder.andWhere(
        '(course.title ILIKE :search OR course.subtitle ILIKE :search)',
        {
          search: `%${query.search.trim()}%`,
        },
      );
    }

    const [courses, total] = await queryBuilder.getManyAndCount();

    const studentEnrollmentCounts =
      await this.getCourseStudentEnrollmentCountsMock(
        courses.map((course) => course.id),
      );

    return {
      items: courses.map((course) => ({
        id: course.id,
        title: course.title,
        subtitle: course.subtitle,
        status: course.status,
        price: course.price,
        isFree: course.isFree,
        couponCode: course.couponCode,
        totalStudentEnrollments: studentEnrollmentCounts.get(course.id) ?? 0,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  private async getCourseStudentEnrollmentCountsMock(courseIds: string[]) {
    const result = new Map<string, number>();

    for (const courseId of courseIds) {
      result.set(courseId, 0);
    }

    return result;
  }

  //   private async getCourseStudentEnrollmentCounts(courseIds: string[]) {
  //   const result = new Map<string, number>();

  //   if (courseIds.length === 0) {
  //     return result;
  //   }

  //   const rows = await this.enrollmentRepository
  //     .createQueryBuilder('enrollment')
  //     .select('enrollment.courseId', 'courseId')
  //     .addSelect('COUNT(enrollment.id)', 'count')
  //     .where('enrollment.courseId IN (:...courseIds)', { courseIds })
  //     .groupBy('enrollment.courseId')
  //     .getRawMany<{ courseId: string; count: string }>();

  //   rows.forEach((row) => {
  //     result.set(row.courseId, Number(row.count));
  //   });

  //   return result;
  // }

  async findCourseById(courseId: string) {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
      },
      relations: {
        chapters: true,
        lessons: true,
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found.');
    }

    return this.buildCourseResponse(course);
  }

  async getCourseSetupProgress(courseId: string) {
    const course = await this.getActiveCourseEntity(courseId);

    const chapterCount = await this.courseChapterRepository.count({
      where: { courseId },
    });

    const lessonCount = await this.lessonRepository.count({
      where: {
        courseId,
        status: Not(LessonStatus.ARCHIVED),
      },
    });

    return this.buildSetupProgress(course, chapterCount, lessonCount);
  }

  async updateCourse(courseId: string, dto: UpdateCourseDto) {
    const course = await this.getActiveCourseEntity(courseId);

    const nextIsFree = dto.isFree ?? course.isFree;
    const nextPrice =
      dto.price !== undefined ? dto.price : Number(course.price ?? 0);

    this.validatePricing(nextIsFree, nextPrice);

    if (dto.title !== undefined) {
      course.title = dto.title;
    }

    if (dto.subtitle !== undefined) {
      course.subtitle = dto.subtitle || null;
    }

    if (dto.description !== undefined) {
      course.description = dto.description || null;
    }

    if (dto.slug !== undefined) {
      const slug = this.createSlug(dto.slug);
      await this.ensureCourseSlugIsAvailable(slug, course.id);
      course.slug = slug;
    }

    if (dto.isFree !== undefined) {
      course.isFree = dto.isFree;
    }

    if (dto.price !== undefined || dto.isFree !== undefined) {
      course.price = nextIsFree ? null : this.formatPrice(nextPrice);
    }

    if (dto.couponCode !== undefined) {
      course.couponCode = dto.couponCode || null;
    }

    if (dto.finalExamTemplateId !== undefined) {
      course.finalExamTemplateId = dto.finalExamTemplateId || null;
    }

    if (dto.status !== undefined) {
      course.status = dto.status;
      course.publishedAt =
        dto.status === CourseStatus.PUBLISHED
          ? (course.publishedAt ?? new Date())
          : course.publishedAt;
    }

    await this.courseRepository.save(course);

    return this.findCourseById(course.id);
  }

  async publishCourse(courseId: string) {
    const course = await this.getActiveCourseEntity(courseId);

    const chapterCount = await this.courseChapterRepository.count({
      where: { courseId },
    });

    const lessonCount = await this.lessonRepository.count({
      where: {
        courseId,
        status: Not(LessonStatus.ARCHIVED),
      },
    });

    this.assertCourseCanBePublished(course, chapterCount, lessonCount);

    course.status = CourseStatus.PUBLISHED;
    course.publishedAt = course.publishedAt ?? new Date();

    await this.courseRepository.save(course);

    return this.findCourseById(course.id);
  }

  async moveCourseToDraft(courseId: string) {
    const course = await this.getActiveCourseEntity(courseId);

    course.status = CourseStatus.DRAFT;

    await this.courseRepository.save(course);

    return this.findCourseById(course.id);
  }

  async removeCourse(courseId: string) {
    const course = await this.getActiveCourseEntity(courseId);

    course.status = CourseStatus.ARCHIVED;

    await this.courseRepository.save(course);

    return {
      message: 'Course archived successfully.',
      id: course.id,
    };
  }

  async restoreArchivedCourse(courseId: string) {
    const course = await this.getAnyCourseEntity(courseId);

    if (course.status !== CourseStatus.ARCHIVED) {
      return this.findCourseById(course.id);
    }

    const chapterCount = await this.courseChapterRepository.count({
      where: { courseId },
    });

    const lessonCount = await this.lessonRepository.count({
      where: {
        courseId,
        status: Not(LessonStatus.ARCHIVED),
      },
    });

    this.assertCourseCanBePublished(course, chapterCount, lessonCount);

    course.status = CourseStatus.PUBLISHED;
    course.publishedAt = course.publishedAt ?? new Date();

    await this.courseRepository.save(course);

    return this.findCourseById(course.id);
  }

  async getPermanentDeleteCheck(courseId: string) {
    const course = await this.getAnyCourseEntity(courseId);

    const dependencies = await this.buildPermanentDeleteDependencyReport(
      course.id,
    );

    const recordsToBeDeleted = await this.buildCourseOwnedDeleteReport(course);

    return {
      courseId: course.id,
      status: course.status,
      canDeletePermanently: !dependencies.hasBlockingDependencies,
      dependencies,
      recordsToBeDeleted,
      recommendation: dependencies.hasBlockingDependencies
        ? 'Keep this course archived. Permanent delete is blocked because the course has enrollment, purchase, or revenue history.'
        : 'This course has no blocking business dependency. Permanent delete will remove the course with its syllabus, lessons, quizzes, vocabulary, final exam, and related learning records.',
    };
  }

  async permanentlyDeleteCourse(courseId: string) {
    const course = await this.getAnyCourseEntity(courseId);

    if (course.status !== CourseStatus.ARCHIVED) {
      throw new BadRequestException(
        'Archive the course before permanent deletion.',
      );
    }

    const dependencies = await this.buildPermanentDeleteDependencyReport(
      course.id,
    );

    if (dependencies.hasBlockingDependencies) {
      throw new BadRequestException({
        message:
          'Course cannot be permanently deleted because it has enrollment, purchase, or revenue history. Keep it archived to preserve historical data.',
        dependencies,
      });
    }

    const recordsToBeDeleted = await this.buildCourseOwnedDeleteReport(course);

    await this.dataSource.transaction(async (manager) => {
      const ids = await this.buildCourseOwnedRecordIds(course);

      await this.deleteByIds(
        manager.getRepository(ExamReviewMetric),
        ids.examReviewMetricIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamReview),
        ids.examReviewIds,
      );
      await this.deleteByIds(
        manager.getRepository(Certificate),
        ids.certificateIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamAnswerItem),
        ids.examAnswerItemIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamAnswer),
        ids.examAnswerIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamAttempt),
        ids.examAttemptIds,
      );

      await this.deleteByIds(
        manager.getRepository(ExamAcceptedAnswer),
        ids.examAcceptedAnswerIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamQuestionOption),
        ids.examQuestionOptionIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamMatchingPair),
        ids.examMatchingPairIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamSequenceItem),
        ids.examSequenceItemIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamQuestion),
        ids.examQuestionIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamSectionRule),
        ids.examSectionRuleIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamSection),
        ids.examSectionIds,
      );
      await this.deleteByIds(
        manager.getRepository(ExamTemplate),
        ids.examTemplateIds,
      );

      await this.deleteByIds(
        manager.getRepository(QuizAttemptAnswerItem),
        ids.quizAttemptAnswerItemIds,
      );
      await this.deleteByIds(
        manager.getRepository(QuizAttemptAnswer),
        ids.quizAttemptAnswerIds,
      );
      await this.deleteByIds(
        manager.getRepository(QuizSession),
        ids.quizSessionIds,
      );

      await this.deleteByIds(
        manager.getRepository(QuizAcceptedAnswer),
        ids.quizAcceptedAnswerIds,
      );
      await this.deleteByIds(
        manager.getRepository(QuizQuestionOption),
        ids.quizQuestionOptionIds,
      );
      await this.deleteByIds(
        manager.getRepository(QuizMatchingPair),
        ids.quizMatchingPairIds,
      );
      await this.deleteByIds(
        manager.getRepository(QuizSequenceItem),
        ids.quizSequenceItemIds,
      );
      await this.deleteByIds(
        manager.getRepository(QuizQuestion),
        ids.quizQuestionIds,
      );
      await this.deleteByIds(manager.getRepository(Quiz), ids.quizIds);

      await this.deleteByIds(
        manager.getRepository(VocabularyReviewSessionItem),
        ids.vocabularyReviewSessionItemIds,
      );
      await this.deleteByIds(
        manager.getRepository(VocabularyReviewSession),
        ids.vocabularyReviewSessionIds,
      );
      await this.deleteByIds(
        manager.getRepository(UserVocabularyProgress),
        ids.userVocabularyProgressIds,
      );
      await this.deleteByIds(
        manager.getRepository(LessonVocabulary),
        ids.vocabularyIds,
      );

      await this.deleteByIds(
        manager.getRepository(UserLessonProgress),
        ids.userLessonProgressIds,
      );
      await this.deleteByIds(
        manager.getRepository(UserCourseProgress),
        ids.userCourseProgressIds,
      );

      await this.deleteByIds(manager.getRepository(Lesson), ids.lessonIds);
      await this.deleteByIds(
        manager.getRepository(CourseChapter),
        ids.chapterIds,
      );

      await manager.getRepository(Course).delete({
        id: course.id,
      });
    });

    return {
      message: 'Course permanently deleted successfully.',
      id: course.id,
      deletedRecords: recordsToBeDeleted,
    };
  }

  private async getAnyCourseEntity(courseId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
      },
    });

    if (!course) {
      throw new NotFoundException('Course not found.');
    }

    return course;
  }

  private assertCourseCanBePublished(
    course: Course,
    chapterCount: number,
    lessonCount: number,
  ) {
    const progress = this.buildSetupProgress(course, chapterCount, lessonCount);

    if (!progress.steps.courseDetails) {
      throw new BadRequestException('Course details are incomplete.');
    }

    if (!progress.steps.pricingAccess) {
      throw new BadRequestException('Pricing and access setup is incomplete.');
    }
  }

  private async buildPermanentDeleteDependencyReport(courseId: string) {
    const studentEnrollmentCount =
      await this.getCourseStudentEnrollmentCountMock(courseId);

    const purchaseHistoryCount =
      await this.getCoursePurchaseHistoryCountMock(courseId);

    const revenueHistoryCount =
      await this.getCourseRevenueHistoryCountMock(courseId);

    const hasBlockingDependencies =
      studentEnrollmentCount > 0 ||
      purchaseHistoryCount > 0 ||
      revenueHistoryCount > 0;

    return {
      hasBlockingDependencies,
      studentEnrollmentCount,
      purchaseHistoryCount,
      revenueHistoryCount,
    };
  }

  private async buildCourseOwnedDeleteReport(course: Course) {
    const ids = await this.buildCourseOwnedRecordIds(course);

    return {
      chapterCount: ids.chapterIds.length,
      lessonCount: ids.lessonIds.length,

      quizCount: ids.quizIds.length,
      quizQuestionCount: ids.quizQuestionIds.length,
      quizSessionCount: ids.quizSessionIds.length,
      quizAttemptAnswerCount: ids.quizAttemptAnswerIds.length,
      quizAttemptAnswerItemCount: ids.quizAttemptAnswerItemIds.length,

      vocabularyCount: ids.vocabularyIds.length,
      userVocabularyProgressCount: ids.userVocabularyProgressIds.length,
      vocabularyReviewSessionCount: ids.vocabularyReviewSessionIds.length,
      vocabularyReviewSessionItemCount:
        ids.vocabularyReviewSessionItemIds.length,

      examTemplateCount: ids.examTemplateIds.length,
      examSectionCount: ids.examSectionIds.length,
      examQuestionCount: ids.examQuestionIds.length,
      examAttemptCount: ids.examAttemptIds.length,
      examAnswerCount: ids.examAnswerIds.length,
      examAnswerItemCount: ids.examAnswerItemIds.length,
      examReviewCount: ids.examReviewIds.length,
      examReviewMetricCount: ids.examReviewMetricIds.length,

      certificateCount: ids.certificateIds.length,

      userCourseProgressCount: ids.userCourseProgressIds.length,
      userLessonProgressCount: ids.userLessonProgressIds.length,
    };
  }

  private async deleteByIds<T extends { id: string }>(
    repository: Repository<T>,
    ids: string[],
  ) {
    if (ids.length === 0) {
      return;
    }

    await repository.delete({
      id: In(ids),
    } as any);
  }

  private async getCourseStudentEnrollmentCountMock(courseId: string) {
    void courseId;
    return 0;
  }

  private async getCoursePurchaseHistoryCountMock(courseId: string) {
    void courseId;
    return 0;
  }

  private async getCourseRevenueHistoryCountMock(courseId: string) {
    void courseId;
    return 0;
  }

  private async buildCourseOwnedRecordIds(course: Course) {
    const chapterIds = (
      await this.courseChapterRepository.find({
        where: { courseId: course.id },
        select: ['id'],
      })
    ).map((item) => item.id);

    const lessonIds = (
      await this.lessonRepository.find({
        where: { courseId: course.id },
        select: ['id'],
      })
    ).map((item) => item.id);

    const userCourseProgressIds = (
      await this.dataSource.getRepository(UserCourseProgress).find({
        where: { courseId: course.id },
        select: ['id'],
      })
    ).map((item) => item.id);

    const userLessonProgressIds = lessonIds.length
      ? (
          await this.dataSource.getRepository(UserLessonProgress).find({
            where: { lessonId: In(lessonIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizIds = (
      await this.dataSource.getRepository(Quiz).find({
        where: { courseId: course.id },
        select: ['id'],
      })
    ).map((item) => item.id);

    const quizQuestionIds = quizIds.length
      ? (
          await this.dataSource.getRepository(QuizQuestion).find({
            where: { quizId: In(quizIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizQuestionOptionIds = quizQuestionIds.length
      ? (
          await this.dataSource.getRepository(QuizQuestionOption).find({
            where: { questionId: In(quizQuestionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizAcceptedAnswerIds = quizQuestionIds.length
      ? (
          await this.dataSource.getRepository(QuizAcceptedAnswer).find({
            where: { questionId: In(quizQuestionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizMatchingPairIds = quizQuestionIds.length
      ? (
          await this.dataSource.getRepository(QuizMatchingPair).find({
            where: { questionId: In(quizQuestionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizSequenceItemIds = quizQuestionIds.length
      ? (
          await this.dataSource.getRepository(QuizSequenceItem).find({
            where: { questionId: In(quizQuestionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizSessionIds = quizIds.length
      ? (
          await this.dataSource.getRepository(QuizSession).find({
            where: { quizId: In(quizIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizAttemptAnswerIds = quizSessionIds.length
      ? (
          await this.dataSource.getRepository(QuizAttemptAnswer).find({
            where: { sessionId: In(quizSessionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizAttemptAnswerItemIds = quizAttemptAnswerIds.length
      ? (
          await this.dataSource.getRepository(QuizAttemptAnswerItem).find({
            where: { attemptAnswerId: In(quizAttemptAnswerIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const vocabularyIds = lessonIds.length
      ? (
          await this.dataSource.getRepository(LessonVocabulary).find({
            where: { lessonId: In(lessonIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const userVocabularyProgressIds = vocabularyIds.length
      ? (
          await this.dataSource.getRepository(UserVocabularyProgress).find({
            where: { vocabularyId: In(vocabularyIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const vocabularyReviewSessionIds = lessonIds.length
      ? (
          await this.dataSource.getRepository(VocabularyReviewSession).find({
            where: { lessonId: In(lessonIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const vocabularyReviewSessionItemIds = vocabularyReviewSessionIds.length
      ? (
          await this.dataSource
            .getRepository(VocabularyReviewSessionItem)
            .find({
              where: { sessionId: In(vocabularyReviewSessionIds) },
              select: ['id'],
            })
        ).map((item) => item.id)
      : [];

    const examTemplateQuery = this.dataSource
      .getRepository(ExamTemplate)
      .createQueryBuilder('template')
      .select(['template.id'])
      .where('template.courseId = :courseId', { courseId: course.id });

    if (course.finalExamTemplateId) {
      examTemplateQuery.orWhere('template.id = :finalExamTemplateId', {
        finalExamTemplateId: course.finalExamTemplateId,
      });
    }

    const examTemplateIds = (await examTemplateQuery.getMany()).map(
      (item) => item.id,
    );

    const examSectionIds = examTemplateIds.length
      ? (
          await this.dataSource.getRepository(ExamSection).find({
            where: { examTemplateId: In(examTemplateIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examSectionRuleIds = examSectionIds.length
      ? (
          await this.dataSource.getRepository(ExamSectionRule).find({
            where: { sectionId: In(examSectionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examQuestionIds = examSectionIds.length
      ? (
          await this.dataSource.getRepository(ExamQuestion).find({
            where: { sectionId: In(examSectionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examQuestionOptionIds = examQuestionIds.length
      ? (
          await this.dataSource.getRepository(ExamQuestionOption).find({
            where: { questionId: In(examQuestionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examAcceptedAnswerIds = examQuestionIds.length
      ? (
          await this.dataSource.getRepository(ExamAcceptedAnswer).find({
            where: { questionId: In(examQuestionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examMatchingPairIds = examQuestionIds.length
      ? (
          await this.dataSource.getRepository(ExamMatchingPair).find({
            where: { questionId: In(examQuestionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examSequenceItemIds = examQuestionIds.length
      ? (
          await this.dataSource.getRepository(ExamSequenceItem).find({
            where: { questionId: In(examQuestionIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examAttemptIds = (
      await this.dataSource.getRepository(ExamAttempt).find({
        where: { courseId: course.id },
        select: ['id'],
      })
    ).map((item) => item.id);

    const examAnswerIds = examAttemptIds.length
      ? (
          await this.dataSource.getRepository(ExamAnswer).find({
            where: { attemptId: In(examAttemptIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examAnswerItemIds = examAnswerIds.length
      ? (
          await this.dataSource.getRepository(ExamAnswerItem).find({
            where: { answerId: In(examAnswerIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examReviewIds = examAttemptIds.length
      ? (
          await this.dataSource.getRepository(ExamReview).find({
            where: { attemptId: In(examAttemptIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const examReviewMetricIds = examReviewIds.length
      ? (
          await this.dataSource.getRepository(ExamReviewMetric).find({
            where: { reviewId: In(examReviewIds) },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const certificateIds = (
      await this.dataSource.getRepository(Certificate).find({
        where: { courseId: course.id },
        select: ['id'],
      })
    ).map((item) => item.id);

    return {
      chapterIds,
      lessonIds,

      userCourseProgressIds,
      userLessonProgressIds,

      quizIds,
      quizQuestionIds,
      quizQuestionOptionIds,
      quizAcceptedAnswerIds,
      quizMatchingPairIds,
      quizSequenceItemIds,
      quizSessionIds,
      quizAttemptAnswerIds,
      quizAttemptAnswerItemIds,

      vocabularyIds,
      userVocabularyProgressIds,
      vocabularyReviewSessionIds,
      vocabularyReviewSessionItemIds,

      examTemplateIds,
      examSectionIds,
      examSectionRuleIds,
      examQuestionIds,
      examQuestionOptionIds,
      examAcceptedAnswerIds,
      examMatchingPairIds,
      examSequenceItemIds,
      examAttemptIds,
      examAnswerIds,
      examAnswerItemIds,
      examReviewIds,
      examReviewMetricIds,

      certificateIds,
    };
  }

  private async getActiveCourseEntity(courseId: string): Promise<Course> {
    const course = await this.courseRepository.findOne({
      where: {
        id: courseId,
      },
    });

    if (!course || course.status === CourseStatus.ARCHIVED) {
      throw new NotFoundException('Course not found.');
    }

    return course;
  }

  private async ensureCourseSlugIsAvailable(
    slug: string,
    currentCourseId?: string,
  ): Promise<void> {
    const existingCourse = await this.courseRepository.findOne({
      where: { slug },
    });

    if (existingCourse && existingCourse.id !== currentCourseId) {
      throw new ConflictException('Course slug already exists.');
    }
  }

  private validatePricing(isFree: boolean, price?: number): void {
    if (isFree) {
      return;
    }

    if (price === undefined || price === null || price <= 0) {
      throw new BadRequestException('Paid course must have a valid price.');
    }
  }

  private formatPrice(price?: number): string | null {
    if (price === undefined || price === null) {
      return null;
    }

    return price.toFixed(2);
  }

  private buildCourseResponse(course: Course) {
    const chapterCount = course.chapters?.length ?? 0;
    const lessonCount =
      course.lessons?.filter(
        (lesson) => lesson.status !== LessonStatus.ARCHIVED,
      ).length ?? 0;

    return {
      ...course,
      setupProgress: this.buildSetupProgress(course, chapterCount, lessonCount),
    };
  }

  private buildSetupProgress(
    course: Course,
    chapterCount: number,
    lessonCount: number,
  ) {
    const steps = {
      courseDetails: Boolean(
        course.title && course.subtitle && course.description,
      ),
      pricingAccess: course.isFree || Boolean(course.price),
      finalExamination: Boolean(course.finalExamTemplateId),
      syllabusBuilder: chapterCount > 0 && lessonCount > 0,
    };

    const completedSteps = Object.values(steps).filter(Boolean).length;

    return {
      percentage: Math.round(
        (completedSteps / Object.keys(steps).length) * 100,
      ),
      steps,
      counts: {
        chapters: chapterCount,
        lessons: lessonCount,
      },
    };
  }

  private createSlug(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');

    if (!slug) {
      throw new BadRequestException('Slug cannot be empty.');
    }

    return slug;
  }
}
