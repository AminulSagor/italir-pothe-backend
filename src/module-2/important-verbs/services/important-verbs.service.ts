import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';
import { ReviewImportantVerbDto } from '../dto/important-verb-progress.dto';
import { UserImportantVerbProgress } from '../entities/user-important-verb-progress.entity';

@Injectable()
export class ImportantVerbsService {
  constructor(
    @InjectRepository(UserImportantVerbProgress)
    private readonly progressRepository: Repository<UserImportantVerbProgress>,

    private readonly dailyChallengesService: DailyChallengesService,
  ) {}

  async reviewVerb(params: {
    userId: string;
    verbId: string;
    dto: ReviewImportantVerbDto;
  }) {
    let progress = await this.progressRepository.findOne({
      where: {
        userId: params.userId,
        verbId: params.verbId,
      },
    });

    if (!progress) {
      progress = this.progressRepository.create({
        userId: params.userId,
        verbId: params.verbId,
        reviewCount: 1,
        lastReviewedAt: new Date(),
      });
    } else {
      progress.reviewCount += 1;
      progress.lastReviewedAt = new Date();
    }

    const savedProgress = await this.progressRepository.save(progress);

    await this.dailyChallengesService.recordInternalActivity({
      userId: params.userId,
      activityType: LearningActivityType.IMPORTANT_VERB_REVIEWED,
      sourceId: `important-verb:${params.verbId}:review:${savedProgress.reviewCount}`,
      value: 1,
      clientActivityDate: params.dto.clientActivityDate,
    });

    return {
      message: 'Important verb reviewed successfully',
      progress: savedProgress,
    };
  }

  async getMyProgress(userId: string) {
    return this.progressRepository.find({
      where: {
        userId,
      },
      order: {
        lastReviewedAt: 'DESC',
      },
    });
  }
}
