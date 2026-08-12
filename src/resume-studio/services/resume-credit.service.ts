import {
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import type { EntityManager } from 'typeorm';
import { Repository } from 'typeorm';
import { StoreWalletService } from '../../package-store/services/store-wallet.service';
import {
  ResumeCreationChargeSource,
  ResumeDocument,
} from '../entities/resume-document.entity';

export interface ResumeStudioAccess {
  freeCreationLimit: number;
  freeCreationsUsed: number;
  freeCreationsRemaining: number;
  paidCredits: number;
  totalCreationsAvailable: number;
  canCreate: boolean;
  nextCreationUses: 'free' | 'credit' | 'none';
  editingIsFree: true;
}

export interface ResumeCreationChargeResult {
  newlyCharged: boolean;
  source: ResumeCreationChargeSource;
}

@Injectable()
export class ResumeCreditService {
  private static readonly DEFAULT_FREE_CREATION_LIMIT = 3;
  private static readonly MAX_FREE_CREATION_LIMIT = 1000;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(ResumeDocument)
    private readonly documentRepository: Repository<ResumeDocument>,
    private readonly walletService: StoreWalletService,
  ) {}

  getFreeCreationLimit(): number {
    const configured = this.configService
      .get<string>('CV_FREE_CREATION_LIMIT')
      ?.trim();

    if (!configured) {
      return ResumeCreditService.DEFAULT_FREE_CREATION_LIMIT;
    }

    const value = Number(configured);

    if (
      !Number.isSafeInteger(value) ||
      value < 0 ||
      value > ResumeCreditService.MAX_FREE_CREATION_LIMIT
    ) {
      throw new InternalServerErrorException(
        `CV_FREE_CREATION_LIMIT must be an integer between 0 and ${ResumeCreditService.MAX_FREE_CREATION_LIMIT}.`,
      );
    }

    return value;
  }

  async getAccess(
    userId: string,
    manager?: EntityManager,
  ): Promise<ResumeStudioAccess> {
    const repository = manager
      ? manager.getRepository(ResumeDocument)
      : this.documentRepository;

    const freeCreationLimit = this.getFreeCreationLimit();

    const [freeCreationsUsed, paidCredits] = await Promise.all([
      repository.count({
        where: {
          userId,
          creationChargeSource: ResumeCreationChargeSource.FREE_ALLOWANCE,
        },
      }),
      this.walletService.getPurchasedCvCredits(userId, manager),
    ]);

    const freeCreationsRemaining = Math.max(
      0,
      freeCreationLimit - freeCreationsUsed,
    );

    const totalCreationsAvailable = freeCreationsRemaining + paidCredits;

    return {
      freeCreationLimit,
      freeCreationsUsed,
      freeCreationsRemaining,
      paidCredits,
      totalCreationsAvailable,
      canCreate: totalCreationsAvailable > 0,
      nextCreationUses:
        freeCreationsRemaining > 0
          ? 'free'
          : paidCredits > 0
            ? 'credit'
            : 'none',
      editingIsFree: true,
    };
  }

  /**
   * Must be called inside a database transaction while the document row is
   * locked. A per-user PostgreSQL advisory lock prevents two different new CVs
   * from consuming the same last free slot concurrently.
   */
  async chargeFirstSuccessfulCreation(
    userId: string,
    document: ResumeDocument,
    manager: EntityManager,
  ): Promise<ResumeCreationChargeResult> {
    if (document.creationChargedAt && document.creationChargeSource) {
      return {
        newlyCharged: false,
        source: document.creationChargeSource,
      };
    }

    await manager.query(
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      [`resume-studio-credit:${userId}`],
    );

    const documentRepository = manager.getRepository(ResumeDocument);
    const freeCreationLimit = this.getFreeCreationLimit();

    const freeCreationsUsed = await documentRepository.count({
      where: {
        userId,
        creationChargeSource: ResumeCreationChargeSource.FREE_ALLOWANCE,
      },
    });

    let source: ResumeCreationChargeSource;

    if (freeCreationsUsed < freeCreationLimit) {
      source = ResumeCreationChargeSource.FREE_ALLOWANCE;
    } else {
      await this.walletService.consumePurchasedCvCredit(userId, manager);
      source = ResumeCreationChargeSource.PAID_CREDIT;
    }

    document.creationChargeSource = source;
    document.creationChargedAt = new Date();
    await documentRepository.save(document);

    return {
      newlyCharged: true,
      source,
    };
  }
}
