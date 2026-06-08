import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Not, Repository } from 'typeorm';

import { Lesson, LessonStatus } from '../../lessons/entities/lesson.entity';
import { CreateCourseDto, UpdateCourseDto } from '../dto/course.dto';
import { Course, CourseStatus } from '../entities/course.entity';
import { CourseChapter } from 'src/module-2/syllabus/entities/course-chapter.entity';

@Injectable()
export class AdminCoursesService {
  constructor(
    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,

    @InjectRepository(CourseChapter)
    private readonly courseChapterRepository: Repository<CourseChapter>,

    @InjectRepository(Lesson)
    private readonly lessonRepository: Repository<Lesson>,
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

  async findAllCourses() {
    const courses = await this.courseRepository.find({
      where: {
        status: Not(CourseStatus.ARCHIVED),
      },
      relations: {
        chapters: true,
        lessons: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return courses.map((course) => this.buildCourseResponse(course));
  }

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

    if (!course || course.status === CourseStatus.ARCHIVED) {
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

    const progress = this.buildSetupProgress(course, chapterCount, lessonCount);

    if (!progress.steps.courseDetails) {
      throw new BadRequestException('Course details are incomplete.');
    }

    if (!progress.steps.pricingAccess) {
      throw new BadRequestException('Pricing and access setup is incomplete.');
    }

    if (!progress.steps.syllabusBuilder) {
      throw new BadRequestException('Syllabus builder is incomplete.');
    }

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
