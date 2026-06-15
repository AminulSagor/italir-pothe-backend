import { Injectable } from '@nestjs/common';
import { ReviewJobSentenceDto } from '../dto/job-sentence-progress.dto';
import { SkillBuilderService } from './skill-builder.service';

@Injectable()
export class JobSentencesService {
  constructor(private readonly skillBuilderService: SkillBuilderService) {}

  async reviewSentence(params: {
    userId: string;
    sentenceId: string;
    dto: ReviewJobSentenceDto;
  }) {
    return this.skillBuilderService.reviewSentence({
      userId: params.userId,
      sentenceId: params.sentenceId,
      dto: params.dto,
    });
  }

  async getMyProgress(userId: string) {
    return this.skillBuilderService.getLegacyJobSentenceProgress(userId);
  }
}
