import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, In, IsNull, Not, Repository } from 'typeorm';

import { FilesService } from 'src/files/services/files.service';
import {
  AdminCareerTrackQueryDto,
  CreateCareerTrackDto,
  CreateSkillBuilderModuleDto,
  CreateSkillBuilderSentenceDto,
  ModuleQueryDto,
  SentenceQueryDto,
  SkillBuilderSentenceSortBy,
  SortOrder,
  UpdateCareerTrackDto,
  UpdateCareerTrackResourcesDto,
  UpdateSkillBuilderModuleDto,
  UpdateSkillBuilderSentenceDto,
} from '../dto/admin-skill-builder.dto';
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
import { UserJobSentenceProgress } from '../entities/user-job-sentence-progress.entity';

@Injectable()
export class AdminSkillBuilderService {
  constructor(
    @InjectRepository(CareerTrack)
    private readonly careerTrackRepository: Repository<CareerTrack>,

    @InjectRepository(SkillBuilderModuleEntity)
    private readonly moduleRepository: Repository<SkillBuilderModuleEntity>,

    @InjectRepository(SkillBuilderSentence)
    private readonly sentenceRepository: Repository<SkillBuilderSentence>,

    @InjectRepository(UserJobSentenceProgress)
    private readonly progressRepository: Repository<UserJobSentenceProgress>,

    private readonly filesService: FilesService,
  ) {}

  async createCareerTrack(dto: CreateCareerTrackDto, adminId: string) {
    await this.assertVideoFile(dto.introVideoFileId);
    await this.assertPdfFile(dto.theoryResourceFileId);

    const track = this.careerTrackRepository.create({
      title: dto.title.trim(),
      subtitleBn: dto.subtitleBn?.trim() || null,
      description: dto.description?.trim() || null,
      iconKey: dto.iconKey?.trim() || 'briefcase',
      cardColor: dto.cardColor?.trim() || '#FFEDE3',
      introVideoFileId: dto.introVideoFileId,
      theoryResourceFileId: dto.theoryResourceFileId,
      status: CareerTrackStatus.PUBLISHED,
      sortOrder: dto.sortOrder ?? 0,
      createdByAdminId: adminId,
      publishedAt: new Date(),
      lastSyncedAt: null,
    });

    return this.careerTrackRepository.save(track);
  }

  async getSummaryMetrics() {
    const totalTracks = await this.careerTrackRepository.count({
      where: { status: Not(CareerTrackStatus.ARCHIVED) },
    });

    const publishedTracks = await this.careerTrackRepository.count({
      where: { status: CareerTrackStatus.PUBLISHED },
    });

    const activeTracks = await this.careerTrackRepository.find({
      where: { status: Not(CareerTrackStatus.ARCHIVED) },
      select: ['id'],
    });

    const trackIds = activeTracks.map((track) => track.id);

    const totalModules = trackIds.length
      ? await this.moduleRepository.count({
          where: {
            careerTrackId: In(trackIds),
            status: SkillBuilderModuleStatus.ACTIVE,
          },
        })
      : 0;

    const activeModules = trackIds.length
      ? await this.moduleRepository.find({
          where: {
            careerTrackId: In(trackIds),
            status: SkillBuilderModuleStatus.ACTIVE,
          },
          select: ['id'],
        })
      : [];

    const moduleIds = activeModules.map((moduleItem) => moduleItem.id);

    const totalSentences = moduleIds.length
      ? await this.sentenceRepository.count({
          where: {
            moduleId: In(moduleIds),
            status: SkillBuilderSentenceStatus.ACTIVE,
          },
        })
      : 0;

    const syncedTracks = await this.careerTrackRepository.count({
      where: {
        status: Not(CareerTrackStatus.ARCHIVED),
        lastSyncedAt: Not(IsNull()),
      },
    });

    return {
      totalTracks,
      publishedTracks,
      totalModules,
      totalSentences,
      syncedTracks,
    };
  }

  async findCareerTracks(query: AdminCareerTrackQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const queryBuilder = this.careerTrackRepository
      .createQueryBuilder('track')
      .where('track.status != :archived', {
        archived: CareerTrackStatus.ARCHIVED,
      })
      .orderBy('track.sortOrder', 'ASC')
      .addOrderBy('track.updatedAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('track.status = :status', {
        status: query.status,
      });
    }

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

    const [items, total] = await queryBuilder.getManyAndCount();

    const enrichedItems = await Promise.all(
      items.map((track) => this.buildAdminTrackListItem(track)),
    );

    return {
      items: enrichedItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findCareerTrackDetails(trackId: string) {
    const track = await this.findActiveTrackOrFail(trackId);

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

    return {
      ...track,
      introVideo: await this.buildFileResponse(track.introVideoFileId),
      theoryResource: await this.buildFileResponse(track.theoryResourceFileId),
      modules: modules.map((moduleItem) => ({
        ...moduleItem,
        sentenceCount: sentenceCountByModuleId.get(moduleItem.id) ?? 0,
      })),
    };
  }

  async updateCareerTrack(trackId: string, dto: UpdateCareerTrackDto) {
    const track = await this.findActiveTrackOrFail(trackId);

    await this.assertOptionalVideoFile(dto.introVideoFileId);
    await this.assertOptionalPdfFile(dto.theoryResourceFileId);

    if (dto.title !== undefined) track.title = dto.title.trim();
    if (dto.subtitleBn !== undefined)
      track.subtitleBn = dto.subtitleBn.trim() || null;
    if (dto.description !== undefined)
      track.description = dto.description.trim() || null;
    if (dto.iconKey !== undefined) track.iconKey = dto.iconKey.trim();
    if (dto.cardColor !== undefined) track.cardColor = dto.cardColor.trim();
    if (dto.introVideoFileId !== undefined)
      track.introVideoFileId = dto.introVideoFileId || null;
    if (dto.theoryResourceFileId !== undefined)
      track.theoryResourceFileId = dto.theoryResourceFileId || null;
    if (dto.sortOrder !== undefined) track.sortOrder = dto.sortOrder;

    return this.careerTrackRepository.save(track);
  }

  async updateResources(trackId: string, dto: UpdateCareerTrackResourcesDto) {
    const track = await this.findActiveTrackOrFail(trackId);

    await this.assertOptionalVideoFile(dto.introVideoFileId);
    await this.assertOptionalPdfFile(dto.theoryResourceFileId);

    if (dto.introVideoFileId !== undefined) {
      track.introVideoFileId = dto.introVideoFileId || null;
    }

    if (dto.theoryResourceFileId !== undefined) {
      track.theoryResourceFileId = dto.theoryResourceFileId || null;
    }

    return this.careerTrackRepository.save(track);
  }

  async deleteIntroVideo(trackId: string) {
    const track = await this.findActiveTrackOrFail(trackId);

    track.introVideoFileId = null;

    return this.careerTrackRepository.save(track);
  }

  async syncCareerTrack(trackId: string) {
    const track = await this.findActiveTrackOrFail(trackId);

    track.lastSyncedAt = new Date();

    const savedTrack = await this.careerTrackRepository.save(track);

    return {
      message: 'Career track synced successfully',
      careerTrackId: savedTrack.id,
      lastSyncedAt: savedTrack.lastSyncedAt,
    };
  }

  async deleteCareerTrack(trackId: string) {
    const track = await this.findActiveTrackOrFail(trackId);

    const modules = await this.moduleRepository.find({
      where: { careerTrackId: track.id },
      select: ['id'],
    });

    const moduleIds = modules.map((moduleItem) => moduleItem.id);

    if (moduleIds.length) {
      const sentences = await this.sentenceRepository.find({
        where: { moduleId: In(moduleIds) },
        select: ['id'],
      });

      const sentenceIds = sentences.map((sentence) => sentence.id);

      if (sentenceIds.length) {
        await this.progressRepository.delete({ sentenceId: In(sentenceIds) });
      }

      await this.sentenceRepository.delete({ moduleId: In(moduleIds) });
      await this.moduleRepository.delete({ id: In(moduleIds) });
    }

    track.status = CareerTrackStatus.ARCHIVED;

    await this.careerTrackRepository.save(track);

    return {
      message: 'Career track deleted successfully',
      careerTrackId: trackId,
    };
  }

  async createModule(trackId: string, dto: CreateSkillBuilderModuleDto) {
    await this.findActiveTrackOrFail(trackId);

    const moduleItem = this.moduleRepository.create({
      careerTrackId: trackId,
      name: dto.name.trim(),
      subtitleBn: dto.subtitleBn?.trim() || null,
      status: SkillBuilderModuleStatus.ACTIVE,
      sortOrder: dto.sortOrder ?? 0,
    });

    return this.moduleRepository.save(moduleItem);
  }

  async findModules(trackId: string, query: ModuleQueryDto) {
    await this.findActiveTrackOrFail(trackId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const queryBuilder = this.moduleRepository
      .createQueryBuilder('module')
      .where('module.careerTrackId = :trackId', { trackId })
      .andWhere('module.status = :status', {
        status: SkillBuilderModuleStatus.ACTIVE,
      })
      .orderBy('module.sortOrder', 'ASC')
      .addOrderBy('module.createdAt', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('module.name ILIKE :search', { search }).orWhere(
            'module.subtitleBn ILIKE :search',
            { search },
          );
        }),
      );
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    const sentenceCountByModuleId = await this.countSentencesByModule(
      items.map((item) => item.id),
    );

    return {
      items: items.map((item) => ({
        ...item,
        sentenceCount: sentenceCountByModuleId.get(item.id) ?? 0,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateModule(moduleId: string, dto: UpdateSkillBuilderModuleDto) {
    const moduleItem = await this.findActiveModuleOrFail(moduleId);

    if (dto.name !== undefined) moduleItem.name = dto.name.trim();
    if (dto.subtitleBn !== undefined)
      moduleItem.subtitleBn = dto.subtitleBn.trim() || null;
    if (dto.sortOrder !== undefined) moduleItem.sortOrder = dto.sortOrder;

    return this.moduleRepository.save(moduleItem);
  }

  async deleteModule(moduleId: string) {
    const moduleItem = await this.findActiveModuleOrFail(moduleId);

    const sentences = await this.sentenceRepository.find({
      where: { moduleId: moduleItem.id },
      select: ['id'],
    });

    const sentenceIds = sentences.map((sentence) => sentence.id);

    if (sentenceIds.length) {
      await this.progressRepository.delete({ sentenceId: In(sentenceIds) });
      await this.sentenceRepository.delete({ id: In(sentenceIds) });
    }

    moduleItem.status = SkillBuilderModuleStatus.ARCHIVED;

    await this.moduleRepository.save(moduleItem);

    return {
      message: 'Skill builder module deleted successfully',
      moduleId,
    };
  }

  async createSentence(
    moduleId: string,
    dto: CreateSkillBuilderSentenceDto,
    adminId: string,
  ) {
    await this.findActiveModuleOrFail(moduleId);

    if (dto.aiVoiceFileId) {
      await this.assertAudioFile(dto.aiVoiceFileId);
    }

    const sentence = this.sentenceRepository.create({
      moduleId,
      italianSentence: dto.italianSentence.trim(),
      bengaliTranslation: dto.bengaliTranslation.trim(),
      aiVoiceFileId: dto.aiVoiceFileId ?? null,
      voiceDurationSeconds: dto.voiceDurationSeconds ?? null,
      status: SkillBuilderSentenceStatus.ACTIVE,
      sortOrder: dto.sortOrder ?? 0,
      createdByAdminId: adminId,
    });

    return this.sentenceRepository.save(sentence);
  }

  async findSentences(moduleId: string, query: SentenceQueryDto) {
    await this.findActiveModuleOrFail(moduleId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const sortBy = query.sortBy ?? SkillBuilderSentenceSortBy.SORT_ORDER;
    const sortOrder = query.sortOrder ?? SortOrder.ASC;

    const queryBuilder = this.sentenceRepository
      .createQueryBuilder('sentence')
      .where('sentence.moduleId = :moduleId', { moduleId })
      .andWhere('sentence.status = :status', {
        status: SkillBuilderSentenceStatus.ACTIVE,
      })
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

    queryBuilder.orderBy(`sentence.${sortBy}`, sortOrder);

    if (sortBy !== SkillBuilderSentenceSortBy.SORT_ORDER) {
      queryBuilder.addOrderBy('sentence.sortOrder', 'ASC');
    }

    if (sortBy !== SkillBuilderSentenceSortBy.CREATED_AT) {
      queryBuilder.addOrderBy('sentence.createdAt', 'ASC');
    }

    const [items, total] = await queryBuilder.getManyAndCount();

    return {
      items,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        sortBy,
        sortOrder,
      },
    };
  }

  async updateSentence(sentenceId: string, dto: UpdateSkillBuilderSentenceDto) {
    const sentence = await this.findActiveSentenceOrFail(sentenceId);

    if (dto.aiVoiceFileId) {
      await this.assertAudioFile(dto.aiVoiceFileId);
    }

    if (dto.italianSentence !== undefined) {
      sentence.italianSentence = dto.italianSentence.trim();
    }

    if (dto.bengaliTranslation !== undefined) {
      sentence.bengaliTranslation = dto.bengaliTranslation.trim();
    }

    if (dto.aiVoiceFileId !== undefined) {
      sentence.aiVoiceFileId = dto.aiVoiceFileId || null;
    }

    if (dto.voiceDurationSeconds !== undefined) {
      sentence.voiceDurationSeconds = dto.voiceDurationSeconds ?? null;
    }

    if (dto.sortOrder !== undefined) {
      sentence.sortOrder = dto.sortOrder;
    }

    return this.sentenceRepository.save(sentence);
  }

  async deleteSentence(sentenceId: string) {
    const sentence = await this.findActiveSentenceOrFail(sentenceId);

    await this.progressRepository.delete({ sentenceId: sentence.id });

    sentence.status = SkillBuilderSentenceStatus.ARCHIVED;

    await this.sentenceRepository.save(sentence);

    return {
      message: 'Skill builder sentence deleted successfully',
      sentenceId,
    };
  }

  private async buildAdminTrackListItem(track: CareerTrack) {
    const modules = await this.moduleRepository.find({
      where: {
        careerTrackId: track.id,
        status: SkillBuilderModuleStatus.ACTIVE,
      },
      select: ['id'],
    });

    const moduleIds = modules.map((moduleItem) => moduleItem.id);

    const sentenceCount = moduleIds.length
      ? await this.sentenceRepository.count({
          where: {
            moduleId: In(moduleIds),
            status: SkillBuilderSentenceStatus.ACTIVE,
          },
        })
      : 0;

    return {
      ...track,
      moduleCount: moduleIds.length,
      sentenceCount,
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

  private async findActiveTrackOrFail(trackId: string) {
    const track = await this.careerTrackRepository.findOne({
      where: { id: trackId },
    });

    if (!track || track.status === CareerTrackStatus.ARCHIVED) {
      throw new NotFoundException('Career track not found');
    }

    return track;
  }

  private async findActiveModuleOrFail(moduleId: string) {
    const moduleItem = await this.moduleRepository.findOne({
      where: { id: moduleId },
    });

    if (
      !moduleItem ||
      moduleItem.status === SkillBuilderModuleStatus.ARCHIVED
    ) {
      throw new NotFoundException('Skill builder module not found');
    }

    return moduleItem;
  }

  private async findActiveSentenceOrFail(sentenceId: string) {
    const sentence = await this.sentenceRepository.findOne({
      where: { id: sentenceId },
    });

    if (!sentence || sentence.status === SkillBuilderSentenceStatus.ARCHIVED) {
      throw new NotFoundException('Skill builder sentence not found');
    }

    return sentence;
  }

  private async assertOptionalVideoFile(fileId?: string | null) {
    if (fileId) {
      await this.assertVideoFile(fileId);
    }
  }

  private async assertOptionalPdfFile(fileId?: string | null) {
    if (fileId) {
      await this.assertPdfFile(fileId);
    }
  }

  private async assertVideoFile(fileId: string) {
    const file = await this.filesService.findActiveFileById(fileId);

    if (!file.mimeType.startsWith('video/')) {
      throw new BadRequestException(
        'Career track master video must be a video file',
      );
    }

    return file;
  }

  private async assertPdfFile(fileId: string) {
    const file = await this.filesService.findActiveFileById(fileId);

    if (file.mimeType !== 'application/pdf') {
      throw new BadRequestException(
        'Career track theory resource must be a PDF file',
      );
    }

    return file;
  }

  private async assertAudioFile(fileId: string) {
    const file = await this.filesService.findActiveFileById(fileId);

    if (!file.mimeType.startsWith('audio/')) {
      throw new BadRequestException('AI voice must be an audio file');
    }

    return file;
  }

  private async buildFileResponse(fileId: string | null) {
    if (!fileId) {
      return null;
    }

    return this.filesService.createSignedReadUrl(fileId);
  }
}
