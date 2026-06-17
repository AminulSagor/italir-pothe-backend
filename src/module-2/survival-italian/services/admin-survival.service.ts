import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, IsNull, Not, Repository } from 'typeorm';

import { FilesService } from 'src/files/services/files.service';
import {
  AdminSurvivalSituationQueryDto,
  CreateSurvivalSituationDto,
  SortOrder,
  SurvivalSituationSortBy,
  UpdateSurvivalSituationDto,
} from '../dto/admin-survival.dto';
import {
  SurvivalCardVariant,
  SurvivalSituation,
  SurvivalSituationStatus,
} from '../entities/survival-situation.entity';
import { UserSurvivalProgress } from '../entities/user-survival-progress.entity';

@Injectable()
export class AdminSurvivalService {
  constructor(
    @InjectRepository(SurvivalSituation)
    private readonly situationRepository: Repository<SurvivalSituation>,

    @InjectRepository(UserSurvivalProgress)
    private readonly progressRepository: Repository<UserSurvivalProgress>,

    private readonly filesService: FilesService,
  ) {}

  async create(dto: CreateSurvivalSituationDto, adminId: string) {
    await this.assertPdfFile(dto.resourceFileId);

    const situation = this.situationRepository.create({
      title: dto.title.trim(),
      subtitleBn: dto.subtitleBn ? dto.subtitleBn.trim() : null,
      iconKey: dto.iconKey.trim(),
      cardColor: dto.cardColor.trim(),
      cardVariant: dto.cardVariant ?? SurvivalCardVariant.NORMAL,
      resourceFileId: dto.resourceFileId,
      status: SurvivalSituationStatus.PUBLISHED,
      sortOrder: dto.sortOrder ?? 0,
      createdByAdminId: adminId,
      publishedAt: new Date(),
    });

    return this.situationRepository.save(situation);
  }

  async findAll(query: AdminSurvivalSituationQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;

    const sortBy = query.sortBy ?? SurvivalSituationSortBy.SORT_ORDER;
    const sortOrder = query.sortOrder ?? SortOrder.ASC;

    const queryBuilder = this.situationRepository
      .createQueryBuilder('situation')
      .where('situation.status != :archived', {
        archived: SurvivalSituationStatus.ARCHIVED,
      })
      .skip((page - 1) * limit)
      .take(limit);

    if (query.status) {
      queryBuilder.andWhere('situation.status = :status', {
        status: query.status,
      });
    }

    if (query.search?.trim()) {
      const search = `%${query.search.trim()}%`;

      queryBuilder.andWhere(
        new Brackets((qb) => {
          qb.where('situation.title ILIKE :search', { search }).orWhere(
            'situation.subtitleBn ILIKE :search',
            { search },
          );
        }),
      );
    }

    queryBuilder.orderBy(`situation.${sortBy}`, sortOrder);

    if (sortBy !== SurvivalSituationSortBy.SORT_ORDER) {
      queryBuilder.addOrderBy('situation.sortOrder', 'ASC');
    }

    if (sortBy !== SurvivalSituationSortBy.CREATED_AT) {
      queryBuilder.addOrderBy('situation.createdAt', 'DESC');
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

  async getSummaryMetrics() {
    const totalSituations = await this.situationRepository.count({
      where: {
        status: Not(SurvivalSituationStatus.ARCHIVED),
      },
    });

    const pdfsAttached = await this.situationRepository.count({
      where: {
        status: Not(SurvivalSituationStatus.ARCHIVED),
        resourceFileId: Not(IsNull()),
      },
    });

    const missingBengali = await this.situationRepository
      .createQueryBuilder('situation')
      .where('situation.status != :archived', {
        archived: SurvivalSituationStatus.ARCHIVED,
      })
      .andWhere(
        new Brackets((qb) => {
          qb.where('situation.subtitleBn IS NULL').orWhere(
            "TRIM(situation.subtitleBn) = ''",
          );
        }),
      )
      .getCount();

    const completionPercent =
      totalSituations === 0
        ? 0
        : Math.round((pdfsAttached / totalSituations) * 100);

    return {
      totalSituations,
      pdfsAttached,
      missingBengali,
      completionPercent,
    };
  }

  async findOne(id: string) {
    const situation = await this.findSituationOrFail(id);

    return {
      ...situation,
      resource: await this.buildResourceResponse(situation.resourceFileId),
    };
  }

  async update(id: string, dto: UpdateSurvivalSituationDto) {
    const situation = await this.findSituationOrFail(id);

    if (dto.resourceFileId) {
      await this.assertPdfFile(dto.resourceFileId);
    }

    if (dto.title !== undefined) {
      situation.title = dto.title.trim();
    }

    if (dto.subtitleBn !== undefined) {
      situation.subtitleBn = dto.subtitleBn.trim() || null;
    }

    if (dto.iconKey !== undefined) {
      situation.iconKey = dto.iconKey.trim();
    }

    if (dto.cardColor !== undefined) {
      situation.cardColor = dto.cardColor.trim();
    }

    if (dto.cardVariant !== undefined) {
      situation.cardVariant = dto.cardVariant;
    }

    if (dto.resourceFileId !== undefined) {
      situation.resourceFileId = dto.resourceFileId || null;
    }

    if (dto.sortOrder !== undefined) {
      situation.sortOrder = dto.sortOrder;
    }

    situation.status = SurvivalSituationStatus.PUBLISHED;
    situation.publishedAt = new Date();

    return this.situationRepository.save(situation);
  }

  async delete(id: string) {
    const situation = await this.findSituationOrFail(id);

    await this.progressRepository.delete({
      situationId: situation.id,
    });

    await this.situationRepository.remove(situation);

    return {
      message: 'Survival situation deleted successfully',
      situationId: id,
    };
  }

  private async findSituationOrFail(id: string) {
    const situation = await this.situationRepository.findOne({
      where: { id },
    });

    if (!situation || situation.status === SurvivalSituationStatus.ARCHIVED) {
      throw new NotFoundException('Survival situation not found');
    }

    return situation;
  }

  private async assertPdfFile(fileId: string) {
    const file = await this.filesService.findActiveFileById(fileId);

    if (file.mimeType !== 'application/pdf') {
      throw new BadRequestException('Survival resource must be a PDF file');
    }

    return file;
  }

  private async buildResourceResponse(fileId: string | null) {
    if (!fileId) {
      return null;
    }

    return this.filesService.createSignedReadUrl(fileId);
  }
}
