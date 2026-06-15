import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';
import { FilesService } from 'src/files/services/files.service';
import {
  CompleteSurvivalItemDto,
  CompleteSurvivalSituationDto,
} from '../dto/survival.dto';
import {
  SurvivalSituation,
  SurvivalSituationStatus,
} from '../entities/survival-situation.entity';
import { UserSurvivalProgress } from '../entities/user-survival-progress.entity';

@Injectable()
export class SurvivalService {
  constructor(
    @InjectRepository(SurvivalSituation)
    private readonly situationRepository: Repository<SurvivalSituation>,

    @InjectRepository(UserSurvivalProgress)
    private readonly progressRepository: Repository<UserSurvivalProgress>,

    private readonly filesService: FilesService,
    private readonly dailyChallengesService: DailyChallengesService,
  ) {}

  async findPublishedSituations(userId: string) {
    const situations = await this.situationRepository.find({
      where: {
        status: SurvivalSituationStatus.PUBLISHED,
      },
      order: {
        sortOrder: 'ASC',
        createdAt: 'ASC',
      },
    });

    const progressList = await this.progressRepository.find({
      where: {
        userId,
      },
    });

    const completedSituationIds = new Set(
      progressList
        .filter((item) => item.isCompleted)
        .map((item) => item.situationId),
    );

    const completedCount = situations.filter((item) =>
      completedSituationIds.has(item.id),
    ).length;

    return {
      items: situations.map((situation) => ({
        id: situation.id,
        title: situation.title,
        subtitleBn: situation.subtitleBn,
        iconKey: situation.iconKey,
        cardColor: situation.cardColor,
        cardVariant: situation.cardVariant,
        sortOrder: situation.sortOrder,
        isCompleted: completedSituationIds.has(situation.id),
      })),
      progress: {
        completedCount,
        totalCount: situations.length,
      },
    };
  }

  async findPublishedSituationDetails(userId: string, situationId: string) {
    const situation = await this.findPublishedSituationOrFail(situationId);

    const progress = await this.progressRepository.findOne({
      where: {
        userId,
        situationId,
      },
    });

    return {
      id: situation.id,
      title: situation.title,
      subtitleBn: situation.subtitleBn,
      iconKey: situation.iconKey,
      cardColor: situation.cardColor,
      cardVariant: situation.cardVariant,
      sortOrder: situation.sortOrder,
      isCompleted: Boolean(progress?.isCompleted),
      resource: await this.buildResourceResponse(situation.resourceFileId),
    };
  }

  async completeSituation(params: {
    userId: string;
    situationId: string;
    dto: CompleteSurvivalSituationDto;
  }) {
    await this.findPublishedSituationOrFail(params.situationId);

    let progress = await this.progressRepository.findOne({
      where: {
        userId: params.userId,
        situationId: params.situationId,
      },
    });

    if (!progress) {
      progress = this.progressRepository.create({
        userId: params.userId,
        situationId: params.situationId,
        isCompleted: true,
        completedAt: new Date(),
      });

      progress = await this.progressRepository.save(progress);

      await this.dailyChallengesService.recordInternalActivity({
        userId: params.userId,
        activityType: LearningActivityType.SURVIVAL_ITALIAN_COMPLETED,
        sourceId: `survival-situation:${params.situationId}:completed`,
        value: 1,
        clientActivityDate: params.dto.clientActivityDate,
      });
    }

    return {
      message: 'Survival Italian situation completed successfully',
      progress,
    };
  }

  async completeItemCompatibility(params: {
    userId: string;
    itemId: string;
    dto: CompleteSurvivalItemDto;
  }) {
    const situationId = params.dto.situationId ?? params.itemId;

    return this.completeSituation({
      userId: params.userId,
      situationId,
      dto: {
        clientActivityDate: params.dto.clientActivityDate,
      },
    });
  }

  async getMyProgress(userId: string) {
    return this.progressRepository.find({
      where: {
        userId,
      },
      order: {
        completedAt: 'DESC',
      },
    });
  }

  private async findPublishedSituationOrFail(situationId: string) {
    const situation = await this.situationRepository.findOne({
      where: {
        id: situationId,
        status: SurvivalSituationStatus.PUBLISHED,
      },
    });

    if (!situation) {
      throw new NotFoundException('Survival situation not found');
    }

    return situation;
  }

  private async buildResourceResponse(fileId: string | null) {
    if (!fileId) {
      return null;
    }

    return this.filesService.createSignedReadUrl(fileId);
  }
}
