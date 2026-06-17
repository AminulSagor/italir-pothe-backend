import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, DataSource, In, Not, Repository } from 'typeorm';

import { FilesService } from 'src/files/services/files.service';
import { CourseChapter } from '../../syllabus/entities/course-chapter.entity';
import { CreateLessonDto, UpdateLessonDto } from '../dto/lesson.dto';
import {
  CreateLessonVocabularyDto,
  LessonVocabularyQueryDto,
  UpdateLessonVocabularyDto,
} from '../dto/lesson-vocabulary.dto';
import { LessonVocabulary } from '../entities/lesson-vocabulary.entity';
import { Lesson, LessonStatus } from '../entities/lesson.entity';
import { QuizAttemptAnswerItem } from 'src/module-2/quizzes/entities/quiz-attempt-answer-item.entity';
import { QuizAttemptAnswer } from 'src/module-2/quizzes/entities/quiz-attempt-answer.entity';
import { QuizSession } from 'src/module-2/quizzes/entities/quiz-session.entity';
import { QuizAcceptedAnswer } from 'src/module-2/quizzes/entities/quiz-accepted-answer.entity';
import { QuizQuestionOption } from 'src/module-2/quizzes/entities/quiz-question-option.entity';
import { QuizMatchingPair } from 'src/module-2/quizzes/entities/quiz-matching-pair.entity';
import { QuizSequenceItem } from 'src/module-2/quizzes/entities/quiz-sequence-item.entity';
import { QuizQuestion } from 'src/module-2/quizzes/entities/quiz-question.entity';
import { Quiz } from 'src/module-2/quizzes/entities/quiz.entity';
import { VocabularyReviewSessionItem } from '../entities/vocabulary-review-session-item.entity';
import { VocabularyReviewSession } from '../entities/vocabulary-review-session.entity';
import { UserVocabularyProgress } from '../entities/user-vocabulary-progress.entity';
import { UserLessonProgress } from 'src/module-2/progress/entities/user-lesson-progress.entity';

@Injectable()
export class AdminLessonsService {
  constructor(
    @InjectRepository(CourseChapter)
    private readonly courseChapterRepository: Repository<CourseChapter>,

    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,

    @InjectRepository(LessonVocabulary)
    private readonly lessonVocabularyRepository: Repository<LessonVocabulary>,

    private readonly filesService: FilesService,
    private readonly dataSource: DataSource,
  ) {}

  async createLesson(chapterId: string, dto: CreateLessonDto) {
    const chapter = await this.getChapterById(chapterId);

    await this.ensureOptionalFileExists(dto.videoFileId);
    await this.ensureOptionalFileExists(dto.theoryAudioFileId);
    await this.ensureOptionalFileExists(dto.supplementaryMaterialFileId);

    const slug = this.createSlug(dto.slug || dto.title);
    await this.ensureLessonSlugIsAvailable(chapter.id, slug);

    const lesson = this.lessonRepository.create({
      courseId: chapter.courseId,
      chapterId: chapter.id,
      title: dto.title.trim(),
      slug,
      videoFileId: dto.videoFileId ?? null,
      theoryText: dto.theoryText ?? null,
      theoryAudioFileId: dto.theoryAudioFileId ?? null,
      bengaliTranslation: dto.bengaliTranslation ?? null,
      supplementaryMaterialFileId: dto.supplementaryMaterialFileId ?? null,
      isFree: dto.isFree ?? true,
      sortOrder: dto.sortOrder ?? 0,
      status: LessonStatus.PUBLISHED,
    });

    const savedLesson = await this.lessonRepository.save(lesson);

    return this.findLessonById(savedLesson.id);
  }

  async findLessonById(lessonId: string) {
    const lesson = await this.lessonRepository.findOne({
      where: {
        id: lessonId,
      },
      relations: {
        chapter: true,
      },
    });

    if (!lesson || lesson.status === LessonStatus.ARCHIVED) {
      throw new NotFoundException('Lesson not found.');
    }

    return lesson;
  }

  async updateLesson(lessonId: string, dto: UpdateLessonDto) {
    const lesson = await this.getActiveLessonEntity(lessonId);

    await this.ensureOptionalFileExists(dto.videoFileId);
    await this.ensureOptionalFileExists(dto.theoryAudioFileId);
    await this.ensureOptionalFileExists(dto.supplementaryMaterialFileId);

    if (dto.title !== undefined) {
      lesson.title = dto.title;
    }

    if (dto.slug !== undefined) {
      const slug = this.createSlug(dto.slug);
      await this.ensureLessonSlugIsAvailable(lesson.chapterId, slug, lesson.id);
      lesson.slug = slug;
    }

    if (dto.videoFileId !== undefined) {
      lesson.videoFileId = dto.videoFileId || null;
    }

    if (dto.theoryText !== undefined) {
      lesson.theoryText = dto.theoryText || null;
    }

    if (dto.theoryAudioFileId !== undefined) {
      lesson.theoryAudioFileId = dto.theoryAudioFileId || null;
    }

    if (dto.bengaliTranslation !== undefined) {
      lesson.bengaliTranslation = dto.bengaliTranslation || null;
    }

    if (dto.supplementaryMaterialFileId !== undefined) {
      lesson.supplementaryMaterialFileId =
        dto.supplementaryMaterialFileId || null;
    }

    if (dto.isFree !== undefined) {
      lesson.isFree = dto.isFree;
    }

    if (dto.sortOrder !== undefined) {
      lesson.sortOrder = dto.sortOrder;
    }

    await this.lessonRepository.save(lesson);

    return this.findLessonById(lesson.id);
  }

  async removeLesson(lessonId: string) {
    const lesson = await this.getLessonEntity(lessonId);
    const recordsToBeDeleted = await this.buildLessonOwnedDeleteReport(
      lesson.id,
    );

    await this.dataSource.transaction(async (manager) => {
      const ids = await this.buildLessonOwnedRecordIds(lesson.id);

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

      await manager.getRepository(Lesson).delete({
        id: lesson.id,
      });
    });

    return {
      message: 'Lesson permanently deleted successfully.',
      id: lesson.id,
      deletedRecords: recordsToBeDeleted,
    };
  }

  private async getLessonEntity(lessonId: string): Promise<Lesson> {
    const lesson = await this.lessonRepository.findOne({
      where: {
        id: lessonId,
      },
    });

    if (!lesson) {
      throw new NotFoundException('Lesson not found.');
    }

    return lesson;
  }

  private async buildLessonOwnedDeleteReport(lessonId: string) {
    const ids = await this.buildLessonOwnedRecordIds(lessonId);

    return {
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

      userLessonProgressCount: ids.userLessonProgressIds.length,
    };
  }

  private async buildLessonOwnedRecordIds(lessonId: string) {
    const quizIds = (
      await this.dataSource.getRepository(Quiz).find({
        where: {
          lessonId,
        },
        select: ['id'],
      })
    ).map((item) => item.id);

    const quizQuestionIds = quizIds.length
      ? (
          await this.dataSource.getRepository(QuizQuestion).find({
            where: {
              quizId: In(quizIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizQuestionOptionIds = quizQuestionIds.length
      ? (
          await this.dataSource.getRepository(QuizQuestionOption).find({
            where: {
              questionId: In(quizQuestionIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizAcceptedAnswerIds = quizQuestionIds.length
      ? (
          await this.dataSource.getRepository(QuizAcceptedAnswer).find({
            where: {
              questionId: In(quizQuestionIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizMatchingPairIds = quizQuestionIds.length
      ? (
          await this.dataSource.getRepository(QuizMatchingPair).find({
            where: {
              questionId: In(quizQuestionIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizSequenceItemIds = quizQuestionIds.length
      ? (
          await this.dataSource.getRepository(QuizSequenceItem).find({
            where: {
              questionId: In(quizQuestionIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizSessionIds = quizIds.length
      ? (
          await this.dataSource.getRepository(QuizSession).find({
            where: {
              quizId: In(quizIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizAttemptAnswerIds = quizSessionIds.length
      ? (
          await this.dataSource.getRepository(QuizAttemptAnswer).find({
            where: {
              sessionId: In(quizSessionIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const quizAttemptAnswerItemIds = quizAttemptAnswerIds.length
      ? (
          await this.dataSource.getRepository(QuizAttemptAnswerItem).find({
            where: {
              attemptAnswerId: In(quizAttemptAnswerIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const vocabularyIds = (
      await this.lessonVocabularyRepository.find({
        where: {
          lessonId,
        },
        select: ['id'],
      })
    ).map((item) => item.id);

    const userVocabularyProgressIds = vocabularyIds.length
      ? (
          await this.dataSource.getRepository(UserVocabularyProgress).find({
            where: {
              vocabularyId: In(vocabularyIds),
            },
            select: ['id'],
          })
        ).map((item) => item.id)
      : [];

    const vocabularyReviewSessionIds = (
      await this.dataSource.getRepository(VocabularyReviewSession).find({
        where: {
          lessonId,
        },
        select: ['id'],
      })
    ).map((item) => item.id);

    const vocabularyReviewSessionItemIds = vocabularyReviewSessionIds.length
      ? (
          await this.dataSource
            .getRepository(VocabularyReviewSessionItem)
            .find({
              where: {
                sessionId: In(vocabularyReviewSessionIds),
              },
              select: ['id'],
            })
        ).map((item) => item.id)
      : [];

    const userLessonProgressIds = (
      await this.dataSource.getRepository(UserLessonProgress).find({
        where: {
          lessonId,
        },
        select: ['id'],
      })
    ).map((item) => item.id);

    return {
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

      userLessonProgressIds,
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

  async createVocabularyItem(lessonId: string, dto: CreateLessonVocabularyDto) {
    await this.getActiveLessonEntity(lessonId);
    await this.ensureOptionalFileExists(dto.aiPronunciationFileId);

    const vocabulary = this.lessonVocabularyRepository.create({
      lessonId,
      italianWord: dto.italianWord,
      aiPronunciationFileId: dto.aiPronunciationFileId ?? null,
      englishMeaning: dto.englishMeaning,
      englishExample: dto.englishExample ?? null,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.lessonVocabularyRepository.save(vocabulary);
  }

  async findVocabularyByLesson(
    lessonId: string,
    query: LessonVocabularyQueryDto,
  ) {
    await this.getActiveLessonEntity(lessonId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const queryBuilder = this.lessonVocabularyRepository
      .createQueryBuilder('vocabulary')
      .where('vocabulary.lessonId = :lessonId', { lessonId })
      .orderBy('vocabulary.sortOrder', 'ASC')
      .addOrderBy('vocabulary.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('vocabulary.italianWord ILIKE :search', { search })
            .orWhere('vocabulary.englishMeaning ILIKE :search', { search })
            .orWhere('vocabulary.englishExample ILIKE :search', { search });
        }),
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        search: query.search?.trim() || null,
      },
    };
  }

  async updateVocabularyItem(
    vocabularyId: string,
    dto: UpdateLessonVocabularyDto,
  ) {
    const vocabulary = await this.getVocabularyById(vocabularyId);

    await this.ensureOptionalFileExists(dto.aiPronunciationFileId);

    if (dto.italianWord !== undefined) {
      vocabulary.italianWord = dto.italianWord;
    }

    if (dto.aiPronunciationFileId !== undefined) {
      vocabulary.aiPronunciationFileId = dto.aiPronunciationFileId || null;
    }

    if (dto.englishMeaning !== undefined) {
      vocabulary.englishMeaning = dto.englishMeaning;
    }

    if (dto.englishExample !== undefined) {
      vocabulary.englishExample = dto.englishExample || null;
    }

    if (dto.sortOrder !== undefined) {
      vocabulary.sortOrder = dto.sortOrder;
    }

    return this.lessonVocabularyRepository.save(vocabulary);
  }

  async removeVocabularyItem(vocabularyId: string) {
    const vocabulary = await this.getVocabularyById(vocabularyId);

    await this.lessonVocabularyRepository.remove(vocabulary);

    return {
      message: 'Vocabulary item deleted successfully.',
      id: vocabularyId,
    };
  }

  private async getChapterById(chapterId: string): Promise<CourseChapter> {
    const chapter = await this.courseChapterRepository.findOne({
      where: {
        id: chapterId,
      },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found.');
    }

    return chapter;
  }

  private async getActiveLessonEntity(lessonId: string): Promise<Lesson> {
    const lesson = await this.lessonRepository.findOne({
      where: {
        id: lessonId,
      },
    });

    if (!lesson || lesson.status === LessonStatus.ARCHIVED) {
      throw new NotFoundException('Lesson not found.');
    }

    return lesson;
  }

  private async getVocabularyById(
    vocabularyId: string,
  ): Promise<LessonVocabulary> {
    const vocabulary = await this.lessonVocabularyRepository.findOne({
      where: {
        id: vocabularyId,
      },
    });

    if (!vocabulary) {
      throw new NotFoundException('Vocabulary item not found.');
    }

    return vocabulary;
  }

  private async ensureLessonSlugIsAvailable(
    chapterId: string,
    slug: string,
    currentLessonId?: string,
  ): Promise<void> {
    const existingLesson = await this.lessonRepository.findOne({
      where: {
        chapterId,
        slug,
        status: Not(LessonStatus.ARCHIVED),
      },
    });

    if (existingLesson && existingLesson.id !== currentLessonId) {
      throw new ConflictException(
        'Lesson slug already exists in this chapter.',
      );
    }
  }

  private async ensureOptionalFileExists(fileId?: string): Promise<void> {
    if (!fileId) {
      return;
    }

    await this.filesService.findActiveFileById(fileId);
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
