import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, Repository } from 'typeorm';

import { FilesService } from 'src/files/services/files.service';
import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';
import {
  MarkCareerTrackTheoryOpenedDto,
  RecordCareerTrackVideoProgressDto,
  ReviewSkillBuilderSentenceDto,
  UserCareerTrackQueryDto,
  UserSentenceQueryDto,
} from '../dto/skill-builder.dto';
import {
  CareerTrack,
  CareerTrackStatus,
} from '../entities/career-track.entity';
import {
  SkillBuilderModuleEntity,
  SkillBuilderModuleStatus,
} from '../entities/skill-builder-module.entity';
import {
  SkillBuilderSentence,
  SkillBuilderSentenceStatus,
} from '../entities/skill-builder-sentence.entity';
import { UserCareerTrackProgress } from '../entities/user-career-track-progress.entity';
import { UserJobSentenceProgress } from '../entities/user-job-sentence-progress.entity';

@Injectable()
export class SkillBuilderService {
  constructor(
    @InjectRepository(CareerTrack)
    private readonly careerTrackRepository: Repository<CareerTrack>,

    @InjectRepository(SkillBuilderModuleEntity)
    private readonly moduleRepository: Repository<SkillBuilderModuleEntity>,

    @InjectRepository(SkillBuilderSentence)
    private readonly sentenceRepository: Repository<SkillBuilderSentence>,

    @InjectRepository(UserJobSentenceProgress)
    private readonly progressRepository: Repository<UserJobSentenceProgress>,

    @InjectRepository(UserCareerTrackProgress)
    private readonly trackProgressRepository: Repository<UserCareerTrackProgress>,

    private readonly filesService: FilesService,
    private readonly dailyChallengesService: DailyChallengesService,
  ) {}

  async findPublishedCareerTracks(
    userId: string,
    query: UserCareerTrackQueryDto,
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.careerTrackRepository
      .createQueryBuilder('track')
      .where('track.status = :status', { status: CareerTrackStatus.PUBLISHED })
      .orderBy('track.sortOrder', 'ASC')
      .addOrderBy('track.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('track.title ILIKE :search', { search })
            .orWhere('track.subtitleBn ILIKE :search', { search })
            .orWhere('track.description ILIKE :search', { search });
        }),
      );
    }

    const [tracks, total] = await queryBuilder.getManyAndCount();

    const items = await Promise.all(
      tracks.map((track) => this.buildUserCareerTrackListItem(track, userId)),
    );

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findPublishedCareerTrackDetails(userId: string, trackId: string) {
    const track = await this.findPublishedTrackOrFail(trackId);

    const modules = await this.moduleRepository.find({
      where: {
        careerTrackId: track.id,
        status: SkillBuilderModuleStatus.ACTIVE,
      },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    const moduleIds = modules.map((moduleItem) => moduleItem.id);
    const sentenceCountByModuleId =
      await this.countSentencesByModule(moduleIds);
    const learnedCountByModuleId = await this.countLearnedSentencesByModule(
      userId,
      moduleIds,
    );

    const trackProgress = await this.getOrCreateTrackProgress(userId, track.id);

    const totalSentences = Array.from(sentenceCountByModuleId.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    const learnedSentences = Array.from(learnedCountByModuleId.values()).reduce(
      (sum, count) => sum + count,
      0,
    );

    return {
      id: track.id,
      title: track.title,
      subtitleBn: track.subtitleBn,
      description: track.description,
      iconKey: track.iconKey,
      cardColor: track.cardColor,
      sortOrder: track.sortOrder,
      introVideo: await this.buildFileResponse(track.introVideoFileId),
      theoryResource: await this.buildFileResponse(track.theoryResourceFileId),
      trackProgress: {
        videoWatchPercent: trackProgress.videoWatchPercent,
        isTheoryOpened: trackProgress.isTheoryOpened,
        theoryOpenedAt: trackProgress.theoryOpenedAt,
        lastActivityAt: trackProgress.lastActivityAt,
      },
      progress: {
        learnedSentences,
        totalSentences,
        completionPercent:
          totalSentences === 0
            ? 0
            : Math.round((learnedSentences / totalSentences) * 100),
      },
      modules: modules.map((moduleItem) => ({
        id: moduleItem.id,
        name: moduleItem.name,
        subtitleBn: moduleItem.subtitleBn,
        sortOrder: moduleItem.sortOrder,
        sentenceCount: sentenceCountByModuleId.get(moduleItem.id) ?? 0,
        learnedSentenceCount: learnedCountByModuleId.get(moduleItem.id) ?? 0,
      })),
    };
  }

  async recordCareerTrackVideoProgress(params: {
    userId: string;
    trackId: string;
    dto: RecordCareerTrackVideoProgressDto;
  }) {
    await this.findPublishedTrackOrFail(params.trackId);

    const progress = await this.getOrCreateTrackProgress(
      params.userId,
      params.trackId,
    );

    progress.videoWatchPercent = Math.max(
      progress.videoWatchPercent,
      params.dto.watchedPercent,
    );
    progress.lastActivityAt = new Date();

    const savedProgress = await this.trackProgressRepository.save(progress);

    if (params.dto.watchedPercent >= 80) {
      await this.dailyChallengesService.recordInternalActivity({
        userId: params.userId,
        activityType: LearningActivityType.LESSON_VIDEO_WATCHED,
        sourceId: `skill-builder-track:${params.trackId}:video-80`,
        value: 100,
        clientActivityDate: params.dto.clientActivityDate,
      });
    }

    if (params.dto.timeSpentSeconds && params.dto.timeSpentSeconds > 0) {
      await this.dailyChallengesService.recordInternalActivity({
        userId: params.userId,
        activityType: LearningActivityType.ACTIVE_LEARNING_MINUTES,
        sourceId: `skill-builder-track:${params.trackId}:video-time:${Date.now()}`,
        value: Math.max(1, Math.floor(params.dto.timeSpentSeconds / 60)),
        clientActivityDate: params.dto.clientActivityDate,
      });
    }

    return savedProgress;
  }

  async markTheoryOpened(params: {
    userId: string;
    trackId: string;
    dto: MarkCareerTrackTheoryOpenedDto;
  }) {
    await this.findPublishedTrackOrFail(params.trackId);

    const progress = await this.getOrCreateTrackProgress(
      params.userId,
      params.trackId,
    );

    progress.isTheoryOpened = true;
    progress.theoryOpenedAt = progress.theoryOpenedAt ?? new Date();
    progress.lastActivityAt = new Date();

    const savedProgress = await this.trackProgressRepository.save(progress);

    await this.dailyChallengesService.recordInternalActivity({
      userId: params.userId,
      activityType: LearningActivityType.LESSON_THEORY_READ,
      sourceId: `skill-builder-track:${params.trackId}:theory-opened`,
      value: 1,
      clientActivityDate: params.dto.clientActivityDate,
    });

    return savedProgress;
  }

  async findModuleSentences(
    userId: string,
    moduleId: string,
    query: UserSentenceQueryDto,
  ) {
    const moduleItem =
      await this.findActiveModuleWithPublishedTrackOrFail(moduleId);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const queryBuilder = this.sentenceRepository
      .createQueryBuilder('sentence')
      .where('sentence.moduleId = :moduleId', { moduleId })
      .andWhere('sentence.status = :status', {
        status: SkillBuilderSentenceStatus.ACTIVE,
      })
      .orderBy('sentence.sortOrder', 'ASC')
      .addOrderBy('sentence.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('sentence.italianSentence ILIKE :search', {
            search,
          }).orWhere('sentence.bengaliTranslation ILIKE :search', { search });
        }),
      );
    }

    const [sentences, total] = await queryBuilder.getManyAndCount();

    const progressList = sentences.length
      ? await this.progressRepository.find({
          where: {
            userId,
            sentenceId: In(sentences.map((sentence) => sentence.id)),
          },
        })
      : [];

    const progressBySentenceId = new Map(
      progressList.map((progress) => [progress.sentenceId, progress]),
    );

    const totalInModule = await this.sentenceRepository.count({
      where: {
        moduleId,
        status: SkillBuilderSentenceStatus.ACTIVE,
      },
    });

    const learnedInModule = await this.progressRepository.count({
      where: {
        userId,
        moduleId,
        isLearned: true,
      },
    });

    return {
      module: {
        id: moduleItem.id,
        name: moduleItem.name,
        subtitleBn: moduleItem.subtitleBn,
        learnedSentences: learnedInModule,
        totalSentences: totalInModule,
      },
      items: await Promise.all(
        sentences.map(async (sentence) => ({
          id: sentence.id,
          italianSentence: sentence.italianSentence,
          bengaliTranslation: sentence.bengaliTranslation,
          sortOrder: sentence.sortOrder,
          aiVoice: await this.buildFileResponse(sentence.aiVoiceFileId),
          voiceDurationSeconds: sentence.voiceDurationSeconds,
          progress: progressBySentenceId.get(sentence.id) ?? null,
        })),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async reviewSentence(params: {
    userId: string;
    sentenceId: string;
    dto: ReviewSkillBuilderSentenceDto;
  }) {
    const sentence = await this.findActiveSentenceOrFail(params.sentenceId);

    const moduleItem = await this.findActiveModuleWithPublishedTrackOrFail(
      sentence.moduleId,
    );

    let progress = await this.progressRepository.findOne({
      where: {
        userId: params.userId,
        sentenceId: sentence.id,
      },
    });

    if (!progress) {
      progress = this.progressRepository.create({
        userId: params.userId,
        careerTrackId: moduleItem.careerTrackId,
        moduleId: moduleItem.id,
        sentenceId: sentence.id,
        reviewCount: 1,
        isLearned: true,
        learnedAt: new Date(),
        lastReviewedAt: new Date(),
      });
    } else {
      progress.reviewCount += 1;
      progress.isLearned = true;
      progress.lastReviewedAt = new Date();
    }

    const savedProgress = await this.progressRepository.save(progress);

    await this.dailyChallengesService.recordInternalActivity({
      userId: params.userId,
      activityType: LearningActivityType.JOB_SENTENCE_REVIEWED,
      sourceId: `skill-builder-sentence:${sentence.id}:review:${savedProgress.reviewCount}`,
      value: 1,
      clientActivityDate: params.dto.clientActivityDate,
    });

    return {
      message: 'Skill builder sentence reviewed successfully',
      sentence,
      progress: savedProgress,
    };
  }

  async getMyProgress(userId: string) {
    const progressItems = await this.progressRepository.find({
      where: { userId },
      order: { lastReviewedAt: 'DESC' },
    });

    return {
      items: progressItems,
    };
  }

  async getLegacyJobSentenceProgress(userId: string) {
    return this.progressRepository.find({
      where: { userId },
      order: { lastReviewedAt: 'DESC' },
    });
  }

  private async getOrCreateTrackProgress(
    userId: string,
    careerTrackId: string,
  ) {
    const existingProgress = await this.trackProgressRepository.findOne({
      where: { userId, careerTrackId },
    });

    if (existingProgress) {
      return existingProgress;
    }

    return this.trackProgressRepository.save(
      this.trackProgressRepository.create({
        userId,
        careerTrackId,
        videoWatchPercent: 0,
        isTheoryOpened: false,
        theoryOpenedAt: null,
        lastActivityAt: null,
      }),
    );
  }

  private async buildUserCareerTrackListItem(
    track: CareerTrack,
    userId: string,
  ) {
    const modules = await this.moduleRepository.find({
      where: {
        careerTrackId: track.id,
        status: SkillBuilderModuleStatus.ACTIVE,
      },
      select: ['id'],
    });

    const moduleIds = modules.map((moduleItem) => moduleItem.id);

    const totalSentences = moduleIds.length
      ? await this.sentenceRepository.count({
          where: {
            moduleId: In(moduleIds),
            status: SkillBuilderSentenceStatus.ACTIVE,
          },
        })
      : 0;

    const learnedSentences = moduleIds.length
      ? await this.progressRepository.count({
          where: {
            userId,
            careerTrackId: track.id,
            isLearned: true,
          },
        })
      : 0;

    return {
      id: track.id,
      title: track.title,
      subtitleBn: track.subtitleBn,
      description: track.description,
      iconKey: track.iconKey,
      cardColor: track.cardColor,
      sortOrder: track.sortOrder,
      moduleCount: moduleIds.length,
      sentenceCount: totalSentences,
      learnedSentenceCount: learnedSentences,
      updatedAt: track.updatedAt,
    };
  }

  private async countSentencesByModule(moduleIds: string[]) {
    const result = new Map<string, number>();

    if (moduleIds.length === 0) {
      return result;
    }

    const rows = await this.sentenceRepository
      .createQueryBuilder('sentence')
      .select('sentence.moduleId', 'moduleId')
      .addSelect('COUNT(sentence.id)', 'count')
      .where('sentence.moduleId IN (:...moduleIds)', { moduleIds })
      .andWhere('sentence.status = :status', {
        status: SkillBuilderSentenceStatus.ACTIVE,
      })
      .groupBy('sentence.moduleId')
      .getRawMany<{ moduleId: string; count: string }>();

    rows.forEach((row) => result.set(row.moduleId, Number(row.count)));

    return result;
  }

  private async countLearnedSentencesByModule(
    userId: string,
    moduleIds: string[],
  ) {
    const result = new Map<string, number>();

    if (moduleIds.length === 0) {
      return result;
    }

    const rows = await this.progressRepository
      .createQueryBuilder('progress')
      .select('progress.moduleId', 'moduleId')
      .addSelect('COUNT(progress.id)', 'count')
      .where('progress.userId = :userId', { userId })
      .andWhere('progress.moduleId IN (:...moduleIds)', { moduleIds })
      .andWhere('progress.isLearned = true')
      .groupBy('progress.moduleId')
      .getRawMany<{ moduleId: string; count: string }>();

    rows.forEach((row) => result.set(row.moduleId, Number(row.count)));

    return result;
  }

  private async findPublishedTrackOrFail(trackId: string) {
    const track = await this.careerTrackRepository.findOne({
      where: { id: trackId, status: CareerTrackStatus.PUBLISHED },
    });

    if (!track) {
      throw new NotFoundException('Career track not found');
    }

    return track;
  }

  private async findActiveModuleWithPublishedTrackOrFail(moduleId: string) {
    const moduleItem = await this.moduleRepository.findOne({
      where: { id: moduleId, status: SkillBuilderModuleStatus.ACTIVE },
    });

    if (!moduleItem) {
      throw new NotFoundException('Skill builder module not found');
    }

    await this.findPublishedTrackOrFail(moduleItem.careerTrackId);

    return moduleItem;
  }

  private async findActiveSentenceOrFail(sentenceId: string) {
    const sentence = await this.sentenceRepository.findOne({
      where: { id: sentenceId, status: SkillBuilderSentenceStatus.ACTIVE },
    });

    if (!sentence) {
      throw new NotFoundException('Skill builder sentence not found');
    }

    return sentence;
  }

  private async buildFileResponse(fileId: string | null) {
    if (!fileId) {
      return null;
    }

    return this.filesService.createSignedReadUrl(fileId);
  }
}
