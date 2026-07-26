import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { LearningActivityService } from 'src/module-2/learning-activity/services/learning-activity.service';
import { ProgressService } from 'src/module-2/progress/services/progress.service';
import { SkillBuilderService } from 'src/module-2/skill-builder/services/skill-builder.service';
import { WebinarsService } from 'src/webinar/services/webinars.service';

type HomeGuideVideo = {
  videoId: string;
};

@Injectable()
export class HomeDashboardService {
  private readonly logger = new Logger(HomeDashboardService.name);

  constructor(
    private readonly learningActivityService: LearningActivityService,
    private readonly progressService: ProgressService,
    private readonly skillBuilderService: SkillBuilderService,
    private readonly webinarsService: WebinarsService,
    private readonly dailyChallengesService: DailyChallengesService,
    private readonly configService: ConfigService,
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
      guideVideo: this.getGuideVideo(),
    };
  }

  private getGuideVideo(): HomeGuideVideo | null {
    const isEnabled = this.getBooleanEnvironmentValue(
      'HOME_GUIDE_VIDEO_ENABLED',
      true,
    );

    if (!isEnabled) {
      return null;
    }

    const youtubeUrl = this.configService
      .get<string>('HOME_GUIDE_VIDEO_YOUTUBE_URL')
      ?.trim();

    if (!youtubeUrl) {
      return null;
    }

    const videoId = this.extractYouTubeVideoId(youtubeUrl);

    if (!videoId) {
      this.logger.warn(
        'HOME_GUIDE_VIDEO_YOUTUBE_URL contains an invalid YouTube URL or video ID.',
      );

      return null;
    }

    return {
      videoId,
    };
  }

  private getBooleanEnvironmentValue(
    key: string,
    defaultValue: boolean,
  ): boolean {
    const value = this.configService.get<string>(key)?.trim().toLowerCase();

    if (!value) {
      return defaultValue;
    }

    return value === 'true';
  }

  private extractYouTubeVideoId(value: string): string | null {
    const videoIdPattern = /^[a-zA-Z0-9_-]{11}$/;

    // Allows putting only the video ID in the environment variable.
    if (videoIdPattern.test(value)) {
      return value;
    }

    try {
      const url = new URL(value);
      const hostname = url.hostname.replace(/^www\./, '').toLowerCase();

      // Example: https://youtu.be/dQw4w9WgXcQ
      if (hostname === 'youtu.be') {
        const videoId = url.pathname.split('/').filter(Boolean)[0];

        return videoId && videoIdPattern.test(videoId) ? videoId : null;
      }

      const supportedYouTubeHosts = new Set([
        'youtube.com',
        'm.youtube.com',
        'music.youtube.com',
        'youtube-nocookie.com',
      ]);

      if (!supportedYouTubeHosts.has(hostname)) {
        return null;
      }

      // Example: https://youtube.com/watch?v=dQw4w9WgXcQ
      const queryVideoId = url.searchParams.get('v');

      if (queryVideoId && videoIdPattern.test(queryVideoId)) {
        return queryVideoId;
      }

      // Supports:
      // /embed/VIDEO_ID
      // /shorts/VIDEO_ID
      // /live/VIDEO_ID
      const pathMatch = url.pathname.match(
        /^\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})(?:\/|$)/,
      );

      return pathMatch?.[1] ?? null;
    } catch {
      return null;
    }
  }
}
