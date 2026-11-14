import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createPublicKey, verify } from 'crypto';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { CoursePurchaseOrder } from 'src/module-2/course-commerce/entities/course-purchase-order.entity';
import { CoursePurchaseStatus } from 'src/module-2/course-commerce/types/course-commerce.type';
import { StoreOrderPackageSnapshot } from 'src/package-store/entities/store-order-package-snapshot.entity';
import { StoreSubscription } from 'src/billing/google-play-subscriptions/entities/store-subscription.entity';
import { StorePackageType } from 'src/package-store/types/package-store.type';
import { UserStoreWallet } from 'src/package-store/entities/user-store-wallet.entity';
import { User } from 'src/users/entities/user.entity';
import { CreateRewardedSessionDto } from '../dto/rewarded-ad.dto';
import { RewardedAdSession } from '../entities/rewarded-ad-session.entity';
import { RewardedUserState } from '../entities/rewarded-user-state.entity';
import {
  INTERVAL_PLACEMENTS,
  RewardedPlacement,
  RewardedSessionStatus,
} from '../types/rewarded-ad.type';

interface SsvKey {
  keyId: number;
  pem: string;
}

@Injectable()
export class RewardedAdsService implements OnModuleInit {
  private readonly logger = new Logger(RewardedAdsService.name);
  private ssvKeys: { expiresAt: number; keys: SsvKey[] } | null = null;

  constructor(
    private readonly config: ConfigService,
    private readonly dataSource: DataSource,
    @InjectRepository(RewardedAdSession)
    private readonly sessions: Repository<RewardedAdSession>,
    @InjectRepository(RewardedUserState)
    private readonly states: Repository<RewardedUserState>,
    @InjectRepository(CoursePurchaseOrder)
    private readonly courseOrders: Repository<CoursePurchaseOrder>,
  ) {}

  onModuleInit() {
    const production = this.config.get<string>('NODE_ENV') === 'production';
    if (!production || !this.bool('ADS_ENABLED', true)) return;

    const allowedAdUnits = this.allowedSsvAdUnits();
    if (
      allowedAdUnits.size === 0 ||
      [...allowedAdUnits].some((value) => !/^ca-app-pub-\d+\/\d+$/.test(value))
    ) {
      throw new Error(
        'ADS_ENABLED requires valid production IDs in ' +
          'ADMOB_REWARDED_ALLOWED_AD_UNIT_IDS.',
      );
    }
  }

  async getConfiguration(userId: string) {
    const [isAdFree, state] = await Promise.all([
      this.isAdFree(userId),
      this.getOrCreateState(userId),
    ]);
    const today = this.today();
    const dailyCount =
      state.dailyBonusDate === today ? state.dailyBonusCount : 0;
    return {
      adsEnabled: this.bool('ADS_ENABLED', true),
      isAdFree,
      nativeAds: this.nativeAdsConfiguration(),
      intervals: {
        careerModule: this.integer('REWARDED_CAREER_INTERVAL', 3),
        quiz: this.integer('REWARDED_QUIZ_INTERVAL', 3),
        vocabularyReveal: this.integer(
          'REWARDED_VOCABULARY_REVEAL_INTERVAL',
          6,
        ),
        survivalPdf: this.integer('REWARDED_SURVIVAL_PDF_INTERVAL', 3),
        verb: this.integer('REWARDED_VERB_INTERVAL', 3),
      },
      dailyChallenge: {
        max: this.integer('REWARDED_DAILY_CHALLENGE_MAX', 3),
        xp: this.integer('REWARDED_DAILY_CHALLENGE_XP', 10),
        used: dailyCount,
        remaining: Math.max(
          0,
          this.integer('REWARDED_DAILY_CHALLENGE_MAX', 3) - dailyCount,
        ),
      },
      dailyChestRequired: this.bool('REWARDED_DAILY_CHEST_REQUIRED', true),
      calls: {
        limitEnabled: this.bool('REWARDED_CALL_LIMIT_ENABLED', false),
        initialFree: this.integer('REWARDED_INITIAL_FREE_CALLS', 1),
        creditsPerAd: this.integer('REWARDED_CALL_CREDITS_PER_AD', 3),
        freeRemaining: Math.max(
          0,
          this.integer('REWARDED_INITIAL_FREE_CALLS', 1) -
            state.outgoingCallsUsed,
        ),
        credits: state.callCredits,
      },
      cvCreditsPerAd: this.integer('REWARDED_CV_CREDITS_PER_AD', 1),
    };
  }

  async createSession(userId: string, dto: CreateRewardedSessionDto) {
    if (!this.bool('ADS_ENABLED', true) || (await this.isAdFree(userId))) {
      return { required: false, reason: 'ad_free' };
    }

    if (dto.placement === RewardedPlacement.DAILY_CHALLENGE_XP) {
      const state = await this.getOrCreateState(userId);
      this.resetDailyCounter(state);
      if (
        state.dailyBonusCount >= this.integer('REWARDED_DAILY_CHALLENGE_MAX', 3)
      ) {
        throw new ForbiddenException('Daily rewarded XP limit reached.');
      }
    }

    if (
      dto.placement === RewardedPlacement.DAILY_CHEST &&
      !this.bool('REWARDED_DAILY_CHEST_REQUIRED', true)
    ) {
      return { required: false, reason: 'disabled' };
    }

    if (INTERVAL_PLACEMENTS.has(dto.placement))
      return this.createIntervalSession(userId, dto);

    const session = this.sessions.create({
      userId,
      placement: dto.placement,
      contextId: dto.contextId?.trim() || null,
      status: RewardedSessionStatus.PENDING,
      transactionId: null,
      adShownAt: null,
      clientEarnedAt: null,
      canceledAt: null,
      verifiedAt: null,
      grantedAt: null,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000),
    });
    await this.sessions.save(session);
    return this.requiredSession(session, false);
  }

  async getSession(userId: string, sessionId: string) {
    const session = await this.sessions.findOneBy({ id: sessionId, userId });
    if (!session) throw new BadRequestException('Rewarded session not found.');
    if (
      session.status === RewardedSessionStatus.PENDING &&
      session.expiresAt <= new Date()
    ) {
      session.status = RewardedSessionStatus.EXPIRED;
      await this.sessions.save(session);
    }
    return this.sessionResponse(session);
  }

  async markClientShown(userId: string, sessionId: string) {
    return this.updateClientLifecycle(userId, sessionId, 'shown');
  }

  async markClientEarned(userId: string, sessionId: string) {
    return this.updateClientLifecycle(userId, sessionId, 'earned');
  }

  async cancelSession(userId: string, sessionId: string) {
    return this.updateClientLifecycle(userId, sessionId, 'canceled');
  }

  async completeDevelopmentSession(userId: string, sessionId: string) {
    const environment = this.config.get<string>('NODE_ENV');
    if (environment !== 'development' && environment !== 'test') {
      this.logger.warn(
        `Rejected development completion session=${this.shortId(sessionId)} environment=${environment ?? 'unset'}`,
      );
      throw new ForbiddenException(
        'Development reward confirmation is disabled.',
      );
    }
    return this.verifyAndGrant(sessionId, `test-${sessionId}`, userId);
  }

  async handleSsvCallback(
    originalUrl: string,
    query: Record<string, string | undefined>,
  ) {
    const sessionId = query.custom_data;
    const transactionId = query.transaction_id;
    const adUnitId = query.ad_unit;
    const ssvUserId = query.user_id;
    if (
      !sessionId ||
      !transactionId ||
      !adUnitId ||
      !ssvUserId ||
      !query.signature ||
      !query.key_id
    )
      throw new BadRequestException('Incomplete SSV callback.');
    const signatureIndex = originalUrl.indexOf('&signature=');
    const question = originalUrl.indexOf('?');
    if (question < 0 || signatureIndex < 0)
      throw new BadRequestException('Invalid SSV callback encoding.');
    const signedData = originalUrl.slice(question + 1, signatureIndex);
    if (
      !(await this.verifySsv(signedData, query.signature, Number(query.key_id)))
    )
      throw new ForbiddenException('Invalid SSV signature.');
    if (!this.allowedSsvAdUnits().has(adUnitId))
      throw new ForbiddenException('SSV ad unit is not allowed.');
    return this.verifyAndGrant(sessionId, transactionId, ssvUserId, true);
  }

  async assertOutgoingCallAvailable(userId: string) {
    if (!this.bool('REWARDED_CALL_LIMIT_ENABLED', false)) return;
    const state = await this.getOrCreateState(userId);
    const free = this.integer('REWARDED_INITIAL_FREE_CALLS', 1);
    if (state.outgoingCallsUsed < free || state.callCredits > 0) return;
    throw new HttpException(
      {
        code: 'REWARDED_CALL_CREDIT_REQUIRED',
        message: 'Watch a rewarded ad to earn call credits.',
      },
      HttpStatus.PAYMENT_REQUIRED,
    );
  }

  async consumeOutgoingCall(userId: string) {
    if (!this.bool('REWARDED_CALL_LIMIT_ENABLED', false)) return;
    await this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, userId);
      const free = this.integer('REWARDED_INITIAL_FREE_CALLS', 1);
      if (state.outgoingCallsUsed < free) state.outgoingCallsUsed += 1;
      else if (state.callCredits > 0) state.callCredits -= 1;
      else
        throw new HttpException(
          'No call credit is available.',
          HttpStatus.PAYMENT_REQUIRED,
        );
      await manager.save(state);
    });
  }

  private async verifyAndGrant(
    sessionId: string,
    transactionId: string,
    expectedUserId?: string,
    allowDelayedSsv = false,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager
        .getRepository(RewardedAdSession)
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.id = :sessionId', { sessionId })
        .getOne();
      if (!session)
        throw new BadRequestException('Rewarded session was not found.');
      if (expectedUserId && expectedUserId !== session.userId)
        throw new ForbiddenException('Rewarded session user mismatch.');
      if (session.status === RewardedSessionStatus.GRANTED)
        return { granted: true, duplicate: true };
      const now = new Date();
      const delayedSsvDeadline = new Date(
        session.createdAt.getTime() +
          this.boundedInteger('REWARDED_SSV_MAX_DELAY_HOURS', 24, 1, 168) *
            60 *
            60 *
            1000,
      );
      if (
        allowDelayedSsv
          ? delayedSsvDeadline <= now
          : session.expiresAt <= now ||
            session.status === RewardedSessionStatus.EXPIRED ||
            session.canceledAt != null
      )
        throw new BadRequestException(
          'Rewarded session is invalid or expired.',
        );
      const duplicate = await manager
        .getRepository(RewardedAdSession)
        .findOneBy({ transactionId });
      if (duplicate && duplicate.id !== session.id)
        throw new BadRequestException('Reward transaction was already used.');
      session.transactionId = transactionId;
      session.status = RewardedSessionStatus.VERIFIED;
      session.verifiedAt = new Date();
      await this.applyReward(manager, session);
      session.status = RewardedSessionStatus.GRANTED;
      session.grantedAt = new Date();
      await manager.save(session);
      this.logger.log(
        `Reward granted session=${this.shortId(session.id)} placement=${session.placement}`,
      );
      return { granted: true, placement: session.placement };
    });
  }

  private async applyReward(
    manager: EntityManager,
    session: RewardedAdSession,
  ) {
    const state = await this.lockState(manager, session.userId);
    if (INTERVAL_PLACEMENTS.has(session.placement)) {
      state.counters = {
        ...state.counters,
        [session.placement]: (state.counters[session.placement] ?? 0) + 1,
      };
    }
    if (session.placement === RewardedPlacement.CALL_CREDITS)
      state.callCredits += this.integer('REWARDED_CALL_CREDITS_PER_AD', 3);
    if (session.placement === RewardedPlacement.DAILY_CHALLENGE_XP) {
      this.resetDailyCounter(state);
      if (
        state.dailyBonusCount >= this.integer('REWARDED_DAILY_CHALLENGE_MAX', 3)
      )
        throw new ForbiddenException('Daily rewarded XP limit reached.');
      state.dailyBonusCount += 1;
      await manager
        .getRepository(User)
        .increment(
          { id: session.userId },
          'totalXp',
          this.integer('REWARDED_DAILY_CHALLENGE_XP', 10),
        );
    }
    if (session.placement === RewardedPlacement.CV_CREDITS) {
      let wallet = await manager
        .getRepository(UserStoreWallet)
        .findOneBy({ userId: session.userId });
      if (!wallet)
        wallet = manager.getRepository(UserStoreWallet).create({
          userId: session.userId,
          aiVoiceMinutes: 0,
          aiVoiceSeconds: 0,
          aiTextTokens: 0,
          cvCredits: 0,
          freeCvGenerationsRemaining: 0,
          freeCvGenerationsGrantedAt: null,
          signupCvCreditsGrantedAt: null,
          unlimitedStreakProtectionUntil: null,
        });
      wallet.cvCredits += this.integer('REWARDED_CV_CREDITS_PER_AD', 1);
      await manager.save(wallet);
    }
    await manager.save(state);
  }

  private async isAdFree(userId: string) {
    const [course, storeSubscription] = await Promise.all([
      this.courseOrders.exist({
        where: { userId, status: CoursePurchaseStatus.PAID },
      }),
      this.dataSource
        .getRepository(StoreSubscription)
        .createQueryBuilder('subscription')
        .innerJoin(
          StoreOrderPackageSnapshot,
          'snapshot',
          'snapshot.orderId = subscription.initialOrderId',
        )
        .where('subscription.userId = :userId', { userId })
        .andWhere('subscription.entitlementActive = true')
        .andWhere('subscription.expiresAt > :now', { now: new Date() })
        .andWhere('snapshot.packageType = :packageType', {
          packageType: StorePackageType.AD_FREE,
        })
        .getExists(),
    ]);
    return course || storeSubscription;
  }

  private async getOrCreateState(userId: string) {
    let state = await this.states.findOneBy({ userId });
    if (!state)
      state = await this.states.save(
        this.states.create({
          userId,
          counters: {},
          outgoingCallsUsed: 0,
          callCredits: 0,
          dailyBonusDate: null,
          dailyBonusCount: 0,
        }),
      );
    return state;
  }

  private async lockState(manager: EntityManager, userId: string) {
    await manager
      .createQueryBuilder()
      .insert()
      .into(RewardedUserState)
      .values({
        userId,
        counters: {},
        outgoingCallsUsed: 0,
        callCredits: 0,
        dailyBonusDate: null,
        dailyBonusCount: 0,
      })
      .orIgnore()
      .execute();
    const state = await manager
      .getRepository(RewardedUserState)
      .createQueryBuilder('state')
      .setLock('pessimistic_write')
      .where('state.userId = :userId', { userId })
      .getOne();
    if (!state)
      throw new BadRequestException('Unable to initialize rewarded state.');
    return state;
  }

  private async createIntervalSession(
    userId: string,
    dto: CreateRewardedSessionDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const state = await this.lockState(manager, userId);
      const existing = await manager
        .getRepository(RewardedAdSession)
        .createQueryBuilder('session')
        .where('session.userId = :userId', { userId })
        .andWhere('session.placement = :placement', {
          placement: dto.placement,
        })
        .andWhere('session.status = :status', {
          status: RewardedSessionStatus.PENDING,
        })
        .andWhere('session.expiresAt > :now', { now: new Date() })
        .andWhere('session.canceledAt IS NULL')
        .orderBy('session.createdAt', 'DESC')
        .getOne();

      if (existing) {
        this.logger.debug(
          `Reusing rewarded session=${this.shortId(existing.id)} placement=${dto.placement} pendingVerification=${this.hasClientStarted(existing)}`,
        );
        return this.requiredSession(existing, true);
      }

      const nextCount = (state.counters[dto.placement] ?? 0) + 1;
      const interval = this.intervalFor(dto.placement);
      if (nextCount % interval !== 0) {
        state.counters = { ...state.counters, [dto.placement]: nextCount };
        await manager.save(state);
        return { required: false, reason: 'interval', count: nextCount };
      }

      const session = manager.create(RewardedAdSession, {
        userId,
        placement: dto.placement,
        contextId: dto.contextId?.trim() || null,
        status: RewardedSessionStatus.PENDING,
        transactionId: null,
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
        adShownAt: null,
        clientEarnedAt: null,
        canceledAt: null,
        verifiedAt: null,
        grantedAt: null,
      });
      await manager.save(session);
      this.logger.debug(
        `Created rewarded session=${this.shortId(session.id)} placement=${dto.placement} count=${nextCount} interval=${interval}`,
      );
      return this.requiredSession(session, false);
    });
  }

  private requiredSession(session: RewardedAdSession, resumed: boolean) {
    return {
      required: true,
      sessionId: session.id,
      customData: session.id,
      ssvUserId: session.userId,
      expiresAt: session.expiresAt,
      resumed,
      verificationPending: resumed && this.hasClientStarted(session),
    };
  }

  private sessionResponse(session: RewardedAdSession) {
    const canceled = session.canceledAt != null;
    return {
      id: session.id,
      placement: session.placement,
      status: canceled ? 'canceled' : session.status,
      granted: session.status === RewardedSessionStatus.GRANTED,
      verificationPending:
        !canceled &&
        session.status === RewardedSessionStatus.PENDING &&
        this.hasClientStarted(session),
      adShown: session.adShownAt != null,
      expiresAt: session.expiresAt,
    };
  }

  private async updateClientLifecycle(
    userId: string,
    sessionId: string,
    event: 'shown' | 'earned' | 'canceled',
  ) {
    return this.dataSource.transaction(async (manager) => {
      const session = await manager
        .getRepository(RewardedAdSession)
        .createQueryBuilder('session')
        .setLock('pessimistic_write')
        .where('session.id = :sessionId', { sessionId })
        .andWhere('session.userId = :userId', { userId })
        .getOne();
      if (!session)
        throw new BadRequestException('Rewarded session not found.');
      if (session.status === RewardedSessionStatus.GRANTED)
        return this.sessionResponse(session);
      if (
        session.status === RewardedSessionStatus.EXPIRED ||
        session.expiresAt <= new Date() ||
        session.canceledAt != null
      ) {
        if (
          session.status !== RewardedSessionStatus.EXPIRED ||
          (event === 'canceled' && session.canceledAt == null)
        ) {
          session.status = RewardedSessionStatus.EXPIRED;
          if (event === 'canceled') session.canceledAt = new Date();
          await manager.save(session);
        }
        return this.sessionResponse(session);
      }

      const now = new Date();
      if (event === 'shown' && session.adShownAt == null)
        session.adShownAt = now;
      if (event === 'earned') {
        session.adShownAt ??= now;
        session.clientEarnedAt ??= now;
      }
      if (event === 'canceled') {
        session.canceledAt = now;
        session.status = RewardedSessionStatus.EXPIRED;
      }
      await manager.save(session);
      return this.sessionResponse(session);
    });
  }

  private shortId(value: string) {
    return value.slice(0, 8);
  }

  private hasClientStarted(session: RewardedAdSession) {
    return session.adShownAt != null || session.clientEarnedAt != null;
  }

  private resetDailyCounter(state: RewardedUserState) {
    const today = this.today();
    if (state.dailyBonusDate !== today) {
      state.dailyBonusDate = today;
      state.dailyBonusCount = 0;
    }
  }
  private today() {
    return new Date().toISOString().slice(0, 10);
  }
  private bool(key: string, fallback: boolean) {
    const value = this.config.get<string>(key);
    return value == null ? fallback : value.toLowerCase() === 'true';
  }
  private integer(key: string, fallback: number) {
    const value = Number(this.config.get<string>(key));
    return Number.isInteger(value) && value > 0 ? value : fallback;
  }

  private boundedInteger(
    key: string,
    fallback: number,
    minimum: number,
    maximum: number,
  ) {
    const value = Number(this.config.get<string>(key));
    return Number.isInteger(value) && value >= minimum && value <= maximum
      ? value
      : fallback;
  }

  private nativeAdsConfiguration() {
    const placement = (
      enabledKey: string,
      options: { firstAfter?: string; interval?: string } = {},
      defaults: { firstAfter?: number; interval?: number } = {},
    ) => ({
      enabled: this.bool(enabledKey, true),
      ...(options.firstAfter
        ? {
            firstAfter: this.boundedInteger(
              options.firstAfter,
              defaults.firstAfter!,
              1,
              1000,
            ),
          }
        : {}),
      ...(options.interval
        ? {
            interval: this.boundedInteger(
              options.interval,
              defaults.interval!,
              1,
              1000,
            ),
          }
        : {}),
    });

    return {
      enabled: this.bool('NATIVE_ADS_ENABLED', true),
      placements: {
        freeVideoProgress: {
          enabled: this.bool('NATIVE_FREE_VIDEO_PROGRESS_ENABLED', true),
          progressPercent: this.boundedInteger(
            'NATIVE_VIDEO_PROGRESS_PERCENT',
            60,
            1,
            99,
          ),
        },
        freeVideoComplete: placement('NATIVE_FREE_VIDEO_COMPLETE_ENABLED'),
        courseCatalog: placement(
          'NATIVE_COURSE_CATALOG_ENABLED',
          { firstAfter: 'NATIVE_COURSE_CATALOG_FIRST_AFTER' },
          { firstAfter: 3 },
        ),
        practiceHub: placement('NATIVE_PRACTICE_HUB_ENABLED'),
        home: placement('NATIVE_HOME_ENABLED'),
        courseDetail: placement(
          'NATIVE_COURSE_DETAIL_ENABLED',
          { firstAfter: 'NATIVE_COURSE_DETAIL_FIRST_AFTER' },
          { firstAfter: 3 },
        ),
        careerTracks: placement(
          'NATIVE_CAREER_TRACKS_ENABLED',
          { firstAfter: 'NATIVE_CAREER_TRACKS_FIRST_AFTER' },
          { firstAfter: 2 },
        ),
        aiTutorLanding: placement('NATIVE_AI_TUTOR_LANDING_ENABLED'),
        survivalItalian: placement(
          'NATIVE_SURVIVAL_ENABLED',
          { firstAfter: 'NATIVE_SURVIVAL_FIRST_AFTER' },
          { firstAfter: 4 },
        ),
        careerTrackDetail: placement('NATIVE_CAREER_TRACK_DETAIL_ENABLED'),
        careerSentences: placement(
          'NATIVE_CAREER_SENTENCES_ENABLED',
          {
            firstAfter: 'NATIVE_CAREER_SENTENCES_FIRST_AFTER',
            interval: 'NATIVE_CAREER_SENTENCES_INTERVAL',
          },
          { firstAfter: 3, interval: 4 },
        ),
        importantVerbs: placement(
          'NATIVE_VERBS_ENABLED',
          {
            firstAfter: 'NATIVE_VERBS_FIRST_AFTER',
            interval: 'NATIVE_VERBS_INTERVAL',
          },
          { firstAfter: 1, interval: 4 },
        ),
        savedVerbs: placement(
          'NATIVE_SAVED_VERBS_ENABLED',
          {
            firstAfter: 'NATIVE_SAVED_VERBS_FIRST_AFTER',
            interval: 'NATIVE_SAVED_VERBS_INTERVAL',
          },
          { firstAfter: 1, interval: 4 },
        ),
        verbDetail: placement(
          'NATIVE_VERB_DETAIL_ENABLED',
          { interval: 'NATIVE_VERB_DETAIL_INTERVAL' },
          { interval: 3 },
        ),
        league: placement(
          'NATIVE_LEAGUE_ENABLED',
          {
            firstAfter: 'NATIVE_LEAGUE_FIRST_AFTER',
            interval: 'NATIVE_LEAGUE_INTERVAL',
          },
          { firstAfter: 3, interval: 4 },
        ),
        messages: placement(
          'NATIVE_MESSAGES_ENABLED',
          {
            firstAfter: 'NATIVE_MESSAGES_FIRST_AFTER',
            interval: 'NATIVE_MESSAGES_INTERVAL',
          },
          { firstAfter: 3, interval: 4 },
        ),
        vocabulary: placement(
          'NATIVE_VOCABULARY_ENABLED',
          {
            firstAfter: 'NATIVE_VOCABULARY_FIRST_AFTER',
            interval: 'NATIVE_VOCABULARY_INTERVAL',
          },
          { firstAfter: 3, interval: 4 },
        ),
      },
    };
  }
  private intervalFor(placement: RewardedPlacement) {
    const keys: Partial<Record<RewardedPlacement, string>> = {
      [RewardedPlacement.CAREER_MODULE]: 'REWARDED_CAREER_INTERVAL',
      [RewardedPlacement.QUIZ_OPEN]: 'REWARDED_QUIZ_INTERVAL',
      [RewardedPlacement.VOCABULARY_REVEAL]:
        'REWARDED_VOCABULARY_REVEAL_INTERVAL',
      [RewardedPlacement.SURVIVAL_PDF]: 'REWARDED_SURVIVAL_PDF_INTERVAL',
      [RewardedPlacement.VERB_DETAIL]: 'REWARDED_VERB_INTERVAL',
    };
    return this.integer(
      keys[placement]!,
      placement === RewardedPlacement.VOCABULARY_REVEAL ? 6 : 3,
    );
  }

  private async verifySsv(
    data: string,
    encodedSignature: string,
    keyId: number,
  ) {
    const keys = await this.getSsvKeys();
    const key = keys.find((item) => item.keyId === keyId);
    if (!key) return false;
    const signature = Buffer.from(
      encodedSignature.replace(/-/g, '+').replace(/_/g, '/'),
      'base64',
    );
    return verify(
      'sha256',
      Buffer.from(data),
      createPublicKey(key.pem),
      signature,
    );
  }

  private allowedSsvAdUnits() {
    const configured =
      this.config.get<string>('ADMOB_REWARDED_ALLOWED_AD_UNIT_IDS') ?? '';
    return new Set(
      configured
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    );
  }

  private async getSsvKeys() {
    if (this.ssvKeys && this.ssvKeys.expiresAt > Date.now())
      return this.ssvKeys.keys;
    const response = await fetch(
      'https://www.gstatic.com/admob/reward/verifier-keys.json',
    );
    if (!response.ok)
      throw new BadRequestException('Unable to load AdMob verification keys.');
    const body = (await response.json()) as {
      keys?: Array<{ keyId?: number; pem?: string }>;
    };
    const keys = (body.keys ?? []).filter(
      (item): item is SsvKey =>
        Number.isInteger(item.keyId) && typeof item.pem === 'string',
    );
    this.ssvKeys = { keys, expiresAt: Date.now() + 12 * 60 * 60 * 1000 };
    return keys;
  }
}
