import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { FilesService } from 'src/files/services/files.service';
import { CourseChapter } from '../../syllabus/entities/course-chapter.entity';
import { CreateLessonDto, UpdateLessonDto } from '../dto/lesson.dto';
import {
  CreateLessonVocabularyDto,
  UpdateLessonVocabularyDto,
} from '../dto/lesson-vocabulary.dto';
import { LessonVocabulary } from '../entities/lesson-vocabulary.entity';
import { Lesson, LessonStatus } from '../entities/lesson.entity';

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
  ) {}

  async createLesson(chapterId: string, dto: CreateLessonDto) {
    const chapter = await this.getChapterById(chapterId);

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
      status: dto.status ?? LessonStatus.DRAFT,
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
        vocabularyItems: true,
      },
    });

    if (!lesson || lesson.status === LessonStatus.ARCHIVED) {
      throw new NotFoundException('Lesson not found.');
    }

    lesson.vocabularyItems = [...(lesson.vocabularyItems ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );

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

    if (dto.status !== undefined) {
      lesson.status = dto.status;
    }

    await this.lessonRepository.save(lesson);

    return this.findLessonById(lesson.id);
  }

  async publishLesson(lessonId: string) {
    const lesson = await this.getActiveLessonEntity(lessonId);

    if (!lesson.title) {
      throw new BadRequestException('Lesson title is required.');
    }

    if (
      !lesson.videoFileId &&
      !lesson.theoryText &&
      !lesson.theoryAudioFileId
    ) {
      throw new BadRequestException(
        'Lesson must have video, theory text, or theory audio before publish.',
      );
    }

    lesson.status = LessonStatus.PUBLISHED;

    await this.lessonRepository.save(lesson);

    return this.findLessonById(lesson.id);
  }

  async moveLessonToDraft(lessonId: string) {
    const lesson = await this.getActiveLessonEntity(lessonId);

    lesson.status = LessonStatus.DRAFT;

    await this.lessonRepository.save(lesson);

    return this.findLessonById(lesson.id);
  }

  async removeLesson(lessonId: string) {
    const lesson = await this.getActiveLessonEntity(lessonId);

    lesson.status = LessonStatus.ARCHIVED;

    await this.lessonRepository.save(lesson);

    return {
      message: 'Lesson archived successfully.',
      id: lesson.id,
    };
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

  async findVocabularyByLesson(lessonId: string) {
    await this.getActiveLessonEntity(lessonId);

    return this.lessonVocabularyRepository.find({
      where: {
        lessonId,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });
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
