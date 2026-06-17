import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, Repository } from 'typeorm';

import { Course } from 'src/module-2/courses/entities/course.entity';
import {
  CreateExamQuestionDto,
  CreateExamSectionDto,
  CreateExamTemplateDto,
  ExamListQueryDto,
  UpdateExamQuestionDto,
  UpdateExamSectionDto,
  UpdateExamTemplateDto,
} from '../dto/admin-exam.dto';
import { ExamAcceptedAnswer } from '../entities/exam-accepted-answer.entity';
import { ExamMatchingPair } from '../entities/exam-matching-pair.entity';
import { ExamQuestionOption } from '../entities/exam-question-option.entity';
import { ExamQuestion } from '../entities/exam-question.entity';
import { ExamSectionRule } from '../entities/exam-section-rule.entity';
import { ExamSection } from '../entities/exam-section.entity';
import { ExamSequenceItem } from '../entities/exam-sequence-item.entity';
import { ExamTemplate } from '../entities/exam-template.entity';
import {
  ExamQuestionStatus,
  ExamSectionStatus,
  ExamTemplateStatus,
} from '../types/final-exam.type';

@Injectable()
export class AdminExamsService {
  constructor(
    @InjectRepository(ExamTemplate)
    private readonly examTemplateRepository: Repository<ExamTemplate>,

    @InjectRepository(ExamSection)
    private readonly examSectionRepository: Repository<ExamSection>,

    @InjectRepository(ExamSectionRule)
    private readonly examSectionRuleRepository: Repository<ExamSectionRule>,

    @InjectRepository(ExamQuestion)
    private readonly examQuestionRepository: Repository<ExamQuestion>,

    @InjectRepository(ExamQuestionOption)
    private readonly examQuestionOptionRepository: Repository<ExamQuestionOption>,

    @InjectRepository(ExamMatchingPair)
    private readonly examMatchingPairRepository: Repository<ExamMatchingPair>,

    @InjectRepository(ExamSequenceItem)
    private readonly examSequenceItemRepository: Repository<ExamSequenceItem>,

    @InjectRepository(ExamAcceptedAnswer)
    private readonly examAcceptedAnswerRepository: Repository<ExamAcceptedAnswer>,

    @InjectRepository(Course)
    private readonly courseRepository: Repository<Course>,
  ) {}

  async createExam(dto: CreateExamTemplateDto) {
    if (dto.courseId) {
      await this.getCourseById(dto.courseId);
    }

    const exam = this.examTemplateRepository.create({
      courseId: dto.courseId ?? null,
      title: dto.title.trim(),
      description: dto.description ?? null,
      overallPassingPercent: dto.overallPassingPercent ?? 70,
      totalDurationMinutes: dto.totalDurationMinutes ?? 60,
      unlockCompletionPercent: dto.unlockCompletionPercent ?? 80,
      plagiarismMonitorEnabled: dto.plagiarismMonitorEnabled ?? true,
      copyPasteMonitorEnabled: dto.copyPasteMonitorEnabled ?? true,
      resultNotice: dto.resultNotice ?? null,
      resultNoticeBn: dto.resultNoticeBn ?? null,
      status: dto.status ?? ExamTemplateStatus.DRAFT,
    });

    const savedExam = await this.examTemplateRepository.save(exam);

    if (savedExam.courseId) {
      await this.courseRepository.update(savedExam.courseId, {
        finalExamTemplateId: savedExam.id,
      });
    }

    return this.findById(savedExam.id);
  }

  async findAll(query: ExamListQueryDto) {
    const where: FindOptionsWhere<ExamTemplate> = {};

    if (query.status) {
      where.status = query.status;
    }

    if (query.courseId) {
      where.courseId = query.courseId;
    }

    return this.examTemplateRepository.find({
      where,
      relations: {
        course: true,
        sections: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });
  }

  async findById(examTemplateId: string) {
    const exam = await this.examTemplateRepository.findOne({
      where: { id: examTemplateId },
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
            acceptedAnswers: {
              answerText: 'ASC',
            },
          },
        },
      },
    });

    if (!exam) {
      throw new NotFoundException('Final exam not found');
    }

    return {
      ...exam,
      setupProgress: this.buildSetupProgress(exam),
    };
  }

  async updateExam(examTemplateId: string, dto: UpdateExamTemplateDto) {
    const exam = await this.getExamById(examTemplateId);

    if (dto.courseId !== undefined) {
      if (dto.courseId) {
        await this.getCourseById(dto.courseId);
      }

      exam.courseId = dto.courseId;
    }

    if (dto.title !== undefined) exam.title = dto.title.trim();
    if (dto.description !== undefined) exam.description = dto.description;
    if (dto.overallPassingPercent !== undefined) {
      exam.overallPassingPercent = dto.overallPassingPercent;
    }
    if (dto.totalDurationMinutes !== undefined) {
      exam.totalDurationMinutes = dto.totalDurationMinutes;
    }
    if (dto.unlockCompletionPercent !== undefined) {
      exam.unlockCompletionPercent = dto.unlockCompletionPercent;
    }
    if (dto.plagiarismMonitorEnabled !== undefined) {
      exam.plagiarismMonitorEnabled = dto.plagiarismMonitorEnabled;
    }
    if (dto.copyPasteMonitorEnabled !== undefined) {
      exam.copyPasteMonitorEnabled = dto.copyPasteMonitorEnabled;
    }
    if (dto.resultNotice !== undefined) exam.resultNotice = dto.resultNotice;
    if (dto.resultNoticeBn !== undefined) {
      exam.resultNoticeBn = dto.resultNoticeBn;
    }
    if (dto.status !== undefined) exam.status = dto.status;

    const savedExam = await this.examTemplateRepository.save(exam);

    if (savedExam.courseId) {
      await this.courseRepository.update(savedExam.courseId, {
        finalExamTemplateId: savedExam.id,
      });
    }

    return this.findById(savedExam.id);
  }

  async publishExam(examTemplateId: string) {
    const exam = await this.findById(examTemplateId);

    if (!exam.sections.length) {
      throw new BadRequestException(
        'Create at least one exam section before publishing',
      );
    }

    await this.examTemplateRepository.update(examTemplateId, {
      status: ExamTemplateStatus.PUBLISHED,
      publishedAt: new Date(),
    });

    if (exam.courseId) {
      await this.courseRepository.update(exam.courseId, {
        finalExamTemplateId: exam.id,
      });
    }

    return this.findById(examTemplateId);
  }

  async archiveExam(examTemplateId: string) {
    await this.getExamById(examTemplateId);

    await this.examTemplateRepository.update(examTemplateId, {
      status: ExamTemplateStatus.ARCHIVED,
      archivedAt: new Date(),
    });

    return { message: 'Final exam archived successfully' };
  }

  async createSection(examTemplateId: string, dto: CreateExamSectionDto) {
    const exam = await this.getExamById(examTemplateId);

    const section = this.examSectionRepository.create({
      examTemplateId: exam.id,
      sectionType: dto.sectionType,
      title: dto.title.trim(),
      subtitle: dto.subtitle ?? null,
      reviewMode: dto.reviewMode,
      questionCount: dto.questionCount ?? 0,
      passingPercent: dto.passingPercent ?? 70,
      timeLimitSeconds: dto.timeLimitSeconds ?? null,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? ExamSectionStatus.DRAFT,
    });

    const savedSection = await this.examSectionRepository.save(section);

    if (dto.rule) {
      await this.upsertSectionRule(savedSection.id, dto.rule);
    }

    return this.findById(exam.id);
  }

  async updateSection(sectionId: string, dto: UpdateExamSectionDto) {
    const section = await this.getSectionById(sectionId);

    if (dto.sectionType !== undefined) section.sectionType = dto.sectionType;
    if (dto.title !== undefined) section.title = dto.title.trim();
    if (dto.subtitle !== undefined) section.subtitle = dto.subtitle;
    if (dto.reviewMode !== undefined) section.reviewMode = dto.reviewMode;
    if (dto.questionCount !== undefined) {
      section.questionCount = dto.questionCount;
    }
    if (dto.passingPercent !== undefined) {
      section.passingPercent = dto.passingPercent;
    }
    if (dto.timeLimitSeconds !== undefined) {
      section.timeLimitSeconds = dto.timeLimitSeconds;
    }
    if (dto.sortOrder !== undefined) section.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) section.status = dto.status;

    const savedSection = await this.examSectionRepository.save(section);

    if (dto.rule) {
      await this.upsertSectionRule(savedSection.id, dto.rule);
    }

    return this.findById(savedSection.examTemplateId);
  }

  async archiveSection(sectionId: string) {
    const section = await this.getSectionById(sectionId);

    await this.examSectionRepository.update(section.id, {
      status: ExamSectionStatus.ARCHIVED,
    });

    return { message: 'Exam section archived successfully' };
  }

  async createQuestion(sectionId: string, dto: CreateExamQuestionDto) {
    const section = await this.getSectionById(sectionId);

    const question = this.examQuestionRepository.create({
      sectionId: section.id,
      questionFormat: dto.questionFormat,
      title: dto.title ?? null,
      subtitle: dto.subtitle ?? null,
      prompt: dto.prompt ?? null,
      promptBn: dto.promptBn ?? null,
      audioFileId: dto.audioFileId ?? null,
      imageFileId: dto.imageFileId ?? null,
      correctBoolean: dto.correctBoolean ?? null,
      audioSourceType: dto.audioSourceType,
      sortOrder: dto.sortOrder ?? 0,
      status: dto.status ?? ExamQuestionStatus.DRAFT,
    });

    const savedQuestion = await this.examQuestionRepository.save(question);
    await this.replaceQuestionChildren(savedQuestion.id, dto);

    await this.syncSectionQuestionCount(section.id);

    return this.findQuestionById(savedQuestion.id);
  }

  async findQuestionsBySection(sectionId: string) {
    await this.getSectionById(sectionId);

    return this.examQuestionRepository.find({
      where: { sectionId },
      relations: {
        options: true,
        pairs: true,
        sequenceItems: true,
        acceptedAnswers: true,
      },
      order: {
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
    });
  }

  async findQuestionById(questionId: string) {
    const question = await this.examQuestionRepository.findOne({
      where: { id: questionId },
      relations: {
        options: true,
        pairs: true,
        sequenceItems: true,
        acceptedAnswers: true,
      },
      order: {
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
    });

    if (!question) {
      throw new NotFoundException('Exam question not found');
    }

    return question;
  }

  async updateQuestion(questionId: string, dto: UpdateExamQuestionDto) {
    const question = await this.getQuestionById(questionId);

    if (dto.questionFormat !== undefined) {
      question.questionFormat = dto.questionFormat;
    }
    if (dto.title !== undefined) question.title = dto.title;
    if (dto.subtitle !== undefined) question.subtitle = dto.subtitle;
    if (dto.prompt !== undefined) question.prompt = dto.prompt;
    if (dto.promptBn !== undefined) question.promptBn = dto.promptBn;
    if (dto.audioFileId !== undefined) question.audioFileId = dto.audioFileId;
    if (dto.imageFileId !== undefined) question.imageFileId = dto.imageFileId;
    if (dto.correctBoolean !== undefined) {
      question.correctBoolean = dto.correctBoolean;
    }
    if (dto.audioSourceType !== undefined) {
      question.audioSourceType = dto.audioSourceType;
    }
    if (dto.sortOrder !== undefined) question.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) question.status = dto.status;

    const savedQuestion = await this.examQuestionRepository.save(question);
    await this.replaceQuestionChildren(savedQuestion.id, dto);

    return this.findQuestionById(savedQuestion.id);
  }

  async archiveQuestion(questionId: string) {
    const question = await this.getQuestionById(questionId);

    await this.examQuestionRepository.update(question.id, {
      status: ExamQuestionStatus.ARCHIVED,
    });

    await this.syncSectionQuestionCount(question.sectionId);

    return { message: 'Exam question archived successfully' };
  }

  private async upsertSectionRule(
    sectionId: string,
    dto: NonNullable<CreateExamSectionDto['rule']>,
  ) {
    let rule = await this.examSectionRuleRepository.findOne({
      where: { sectionId },
    });

    if (!rule) {
      rule = this.examSectionRuleRepository.create({
        sectionId,
      });
    }

    if (dto.playbackLocked !== undefined) {
      rule.playbackLocked = dto.playbackLocked;
    }
    if (dto.accentBarEnabled !== undefined) {
      rule.accentBarEnabled = dto.accentBarEnabled;
    }
    if (dto.minWords !== undefined) rule.minWords = dto.minWords;
    if (dto.maxWords !== undefined) rule.maxWords = dto.maxWords;
    if (dto.maxDurationSeconds !== undefined) {
      rule.maxDurationSeconds = dto.maxDurationSeconds;
    }
    if (dto.rerecordPolicy !== undefined) {
      rule.rerecordPolicy = dto.rerecordPolicy;
    }

    await this.examSectionRuleRepository.save(rule);
  }

  private async replaceQuestionChildren(
    questionId: string,
    dto: CreateExamQuestionDto | UpdateExamQuestionDto,
  ) {
    if (dto.options) {
      await this.examQuestionOptionRepository.delete({ questionId });

      const options = dto.options.map((option, index) =>
        this.examQuestionOptionRepository.create({
          questionId,
          optionText: option.optionText,
          isCorrect: option.isCorrect ?? false,
          sortOrder: option.sortOrder ?? index,
        }),
      );

      await this.examQuestionOptionRepository.save(options);
    }

    if (dto.pairs) {
      await this.examMatchingPairRepository.delete({ questionId });

      const pairs = dto.pairs.map((pair, index) =>
        this.examMatchingPairRepository.create({
          questionId,
          leftText: pair.leftText,
          rightText: pair.rightText,
          sortOrder: pair.sortOrder ?? index,
        }),
      );

      await this.examMatchingPairRepository.save(pairs);
    }

    if (dto.sequenceItems) {
      await this.examSequenceItemRepository.delete({ questionId });

      const items = dto.sequenceItems.map((item, index) =>
        this.examSequenceItemRepository.create({
          questionId,
          itemText: item.itemText,
          isDecoy: item.isDecoy ?? false,
          correctOrder: item.correctOrder ?? index,
        }),
      );

      await this.examSequenceItemRepository.save(items);
    }

    if (dto.acceptedAnswers) {
      await this.examAcceptedAnswerRepository.delete({ questionId });

      const answers = dto.acceptedAnswers.map((answer) =>
        this.examAcceptedAnswerRepository.create({
          questionId,
          answerText: answer.answerText,
          ignoreCase: answer.ignoreCase ?? true,
          ignorePunctuation: answer.ignorePunctuation ?? true,
        }),
      );

      await this.examAcceptedAnswerRepository.save(answers);
    }
  }

  private async syncSectionQuestionCount(sectionId: string) {
    const questionCount = await this.examQuestionRepository.count({
      where: {
        sectionId,
        status: ExamQuestionStatus.ACTIVE,
      },
    });

    await this.examSectionRepository.update(sectionId, {
      questionCount,
    });
  }

  private buildSetupProgress(exam: ExamTemplate) {
    const hasCourseLink = Boolean(exam.courseId);
    const hasGlobalRules = Boolean(
      exam.unlockCompletionPercent &&
      exam.totalDurationMinutes &&
      exam.overallPassingPercent,
    );
    const hasSections = exam.sections.length >= 4;
    const hasQuestions = exam.sections.some(
      (section) => section.questions?.length > 0,
    );

    const completed = [
      hasCourseLink,
      hasGlobalRules,
      hasSections,
      hasQuestions,
    ].filter(Boolean).length;

    return {
      percentage: Math.round((completed / 4) * 100),
      checklist: {
        courseLinked: hasCourseLink,
        globalRulesConfigured: hasGlobalRules,
        examSectionsConfigured: hasSections,
        questionsConfigured: hasQuestions,
      },
    };
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

  private async getExamById(examTemplateId: string) {
    const exam = await this.examTemplateRepository.findOne({
      where: { id: examTemplateId },
    });

    if (!exam) {
      throw new NotFoundException('Final exam not found');
    }

    return exam;
  }

  private async getSectionById(sectionId: string) {
    const section = await this.examSectionRepository.findOne({
      where: { id: sectionId },
    });

    if (!section) {
      throw new NotFoundException('Exam section not found');
    }

    return section;
  }

  private async getQuestionById(questionId: string) {
    const question = await this.examQuestionRepository.findOne({
      where: { id: questionId },
    });

    if (!question) {
      throw new NotFoundException('Exam question not found');
    }

    return question;
  }
}
