import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { DailyChallengesService } from 'src/module-2/daily-challenges/services/daily-challenges.service';
import { LearningActivityType } from 'src/module-2/daily-challenges/types/daily-challenge.type';
import { UserCourseProgress } from '../entities/user-course-progress.entity';
import { UserLessonProgress } from '../entities/user-lesson-progress.entity';
import { ScoringService } from 'src/module-2/scoring/services/scoring.service';
import { StreakService } from 'src/module-2/scoring/services/streak.service';
import { LeaderboardXpService } from 'src/module-2/leaderboard/services/leaderboard-xp.service';
import { LeaderboardXpSourceType } from 'src/module-2/leaderboard/types/leaderboard.type';

interface ProgressUser {
  id: string;
}

@Injectable()
export class ProgressService {
  constructor(
    @InjectRepository(UserLessonProgress)
    private readonly lessonProgressRepository: Repository<UserLessonProgress>,

    @InjectRepository(UserCourseProgress)
    private readonly courseProgressRepository: Repository<UserCourseProgress>,

    private readonly dailyChallengesService: DailyChallengesService,
    private readonly scoringService: ScoringService,
    private readonly streakService: StreakService,
    private readonly leaderboardXpService: LeaderboardXpService,
  ) {}

  async recordVideoProgress(params: {
    user: ProgressUser;
    courseId: string;
    lessonId: string;
    watchedPercent: number;
    timeSpentSeconds?: number;
    clientActivityDate?: string;
  }) {
    const progress = await this.getOrCreateLessonProgress(
      params.user.id,
      params.courseId,
      params.lessonId,
    );

    progress.videoWatchPercent = Math.max(
      progress.videoWatchPercent,
      params.watchedPercent,
    );

    const savedProgress = await this.lessonProgressRepository.save(progress);

    if (params.watchedPercent >= 80) {
      await this.dailyChallengesService.recordInternalActivity({
        userId: params.user.id,
        activityType: LearningActivityType.LESSON_VIDEO_WATCHED,
        sourceId: `lesson:${params.lessonId}:video-80`,
        value: params.watchedPercent,
        clientActivityDate: params.clientActivityDate,
      });
    }

    if (params.timeSpentSeconds && params.timeSpentSeconds > 0) {
      await this.dailyChallengesService.recordInternalActivity({
        userId: params.user.id,
        activityType: LearningActivityType.ACTIVE_LEARNING_MINUTES,
        sourceId: `lesson:${params.lessonId}:video-time:${Date.now()}`,
        value: Math.max(1, Math.floor(params.timeSpentSeconds / 60)),
        clientActivityDate: params.clientActivityDate,
      });
    }

    return savedProgress;
  }

  async markTheoryRead(params: {
    user: ProgressUser;
    courseId: string;
    lessonId: string;
    clientActivityDate?: string;
  }) {
    const progress = await this.getOrCreateLessonProgress(
      params.user.id,
      params.courseId,
      params.lessonId,
    );

    progress.isTheoryRead = true;

    const savedProgress = await this.lessonProgressRepository.save(progress);

    await this.dailyChallengesService.recordInternalActivity({
      userId: params.user.id,
      activityType: LearningActivityType.LESSON_THEORY_READ,
      sourceId: `lesson:${params.lessonId}:theory-read`,
      value: 1,
      clientActivityDate: params.clientActivityDate,
    });

    return savedProgress;
  }

  async recordAudioTrackListened(params: {
    user: ProgressUser;
    courseId: string;
    lessonId: string;
    audioFileId?: string;
    clientActivityDate?: string;
  }) {
    const sourceAudioId = params.audioFileId ?? params.lessonId;

    await this.dailyChallengesService.recordInternalActivity({
      userId: params.user.id,
      activityType: LearningActivityType.AUDIO_TRACK_LISTENED,
      sourceId: `lesson:${params.lessonId}:audio:${sourceAudioId}`,
      value: 1,
      clientActivityDate: params.clientActivityDate,
    });

    return {
      message: 'Audio listening activity recorded successfully',
    };
  }

  async markLessonCompleted(params: {
    user: ProgressUser;
    courseId: string;
    lessonId: string;
    clientActivityDate?: string;
  }) {
    const progress = await this.getOrCreateLessonProgress(
      params.user.id,
      params.courseId,
      params.lessonId,
    );

    if (!progress.isCompleted) {
      progress.isCompleted = true;
      progress.completedAt = new Date();

      await this.lessonProgressRepository.save(progress);

      await this.dailyChallengesService.recordInternalActivity({
        userId: params.user.id,
        activityType: LearningActivityType.LESSON_COMPLETED,
        sourceId: `lesson:${params.lessonId}:completed`,
        value: 1,
        clientActivityDate: params.clientActivityDate,
      });

      /*
       * Existing ScoringService remains the
       * source of truth for XP.
       */
      const reward = await this.scoringService.recordLessonCompletionXp({
        userId: params.user.id,
        lessonId: params.lessonId,
        baseXp: 20,
      });

      const streak = await this.streakService.getUserStreakSummary(
        params.user.id,
      );

      /*
       * Mirror the exact scoring reward
       * into the leaderboard.
       */
      await this.leaderboardXpService.awardXp({
        userId: params.user.id,
        sourceType: LeaderboardXpSourceType.LESSON_COMPLETION,
        sourceReference: params.lessonId,
        idempotencyKey: `lesson:${params.lessonId}:user:${params.user.id}:leaderboard-xp`,
        baseXp: reward.baseXp,
        streakBonusXp: 0,
        masteryBonusXp: 0,
        speedBonusXp: 0,
        awardedXp: reward.totalXpEarned,
        multiplier: reward.boostMultiplier,
        streakDays: streak.currentDays,
      });
    }

    await this.refreshCourseProgress(params.user.id, params.courseId);

    return this.getCourseProgress(params.user.id, params.courseId);
  }

  async getCourseProgress(userId: string, courseId: string) {
    const progress = await this.courseProgressRepository.findOne({
      where: { userId, courseId },
    });

    if (!progress) {
      return {
        userId,
        courseId,
        completedLessons: 0,
        totalLessons: 0,
        completionPercent: 0,
      };
    }

    return progress;
  }

  async getCourseCompletionPercent(userId: string, courseId: string) {
    const progress = await this.getCourseProgress(userId, courseId);

    return progress.completionPercent;
  }

  private async getOrCreateLessonProgress(
    userId: string,
    courseId: string,
    lessonId: string,
  ) {
    const existingProgress = await this.lessonProgressRepository.findOne({
      where: { userId, lessonId },
    });

    if (existingProgress) {
      return existingProgress;
    }

    const progress = this.lessonProgressRepository.create({
      userId,
      courseId,
      lessonId,
      videoWatchPercent: 0,
      isTheoryRead: false,
      isCompleted: false,
      completedAt: null,
    });

    return this.lessonProgressRepository.save(progress);
  }

  private async refreshCourseProgress(userId: string, courseId: string) {
    const lessonProgressList = await this.lessonProgressRepository.find({
      where: { userId, courseId },
    });

    const totalLessons = lessonProgressList.length;
    const completedLessons = lessonProgressList.filter(
      (item) => item.isCompleted,
    ).length;

    const completionPercent =
      totalLessons === 0
        ? 0
        : Math.round((completedLessons / totalLessons) * 100);

    let courseProgress = await this.courseProgressRepository.findOne({
      where: { userId, courseId },
    });

    if (!courseProgress) {
      courseProgress = this.courseProgressRepository.create({
        userId,
        courseId,
      });
    }

    courseProgress.totalLessons = totalLessons;
    courseProgress.completedLessons = completedLessons;
    courseProgress.completionPercent = completionPercent;
    courseProgress.lastActivityAt = new Date();

    return this.courseProgressRepository.save(courseProgress);
  }
}
