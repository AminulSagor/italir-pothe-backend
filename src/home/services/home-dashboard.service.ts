import { Injectable } from '@nestjs/common';

import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { LearningActivityService } from 'src/module-2/learning-activity/services/learning-activity.service';
import { ProgressService } from 'src/module-2/progress/services/progress.service';
import { SkillBuilderService } from 'src/module-2/skill-builder/services/skill-builder.service';
import { WebinarsService } from 'src/webinar/services/webinars.service';

@Injectable()
export class HomeDashboardService {
  constructor(
    private readonly learningActivityService: LearningActivityService,
    private readonly progressService: ProgressService,
    private readonly skillBuilderService: SkillBuilderService,
    private readonly webinarsService: WebinarsService,
    private readonly dailyChallengesService: DailyChallengesService,
  ) {}

  async getDashboard(userId: string, weekStart?: string) {
    const [overview, currentChapter, careerTracks, webinar, challenges] =
      await Promise.all([
        this.learningActivityService.getWeeklySummary(userId, weekStart),
        this.progressService.getCurrentChapter(userId),
        this.skillBuilderService.findHomeCareerTracks(userId),
        this.webinarsService.getNextHomeWebinar(),
        this.dailyChallengesService.getTodayHomeSummary(userId),
      ]);

    return {
      overview: {
        totalSeconds: overview.totalSeconds,
        days: overview.days,
      },
      currentChapter,
      careerTracks,
      webinar,
      dailyChallenges: {
        completed: challenges.completed,
        total: challenges.total,
      },
      streakDays: challenges.streakDays,
    };
  }
}
