import { ConfigService } from '@nestjs/config';
import { DataSource, Repository } from 'typeorm';

import { AiConsentService } from '../ai-consent/ai-consent.service';
import { AiTutorLearnerProfile } from './entities/ai-tutor-learner-profile.entity';
import { AiTutorLearningMemory } from './entities/ai-tutor-learning-memory.entity';
import {
  AiTutorLiveSession,
  AiTutorLiveSessionStatus,
} from './entities/ai-tutor-live-session.entity';
import { AiTutorLiveSessionService } from './ai-tutor-live-session.service';
import { GeminiLiveService } from './gemini-live.service';

describe('AiTutorLiveSessionService consent enforcement', () => {
  it('discards pending summary data instead of calling Gemini after withdrawal', async () => {
    const session = {
      id: 'live-session-id',
      userId: 'user-id',
      status: AiTutorLiveSessionStatus.ACTIVE,
      summaryLeaseUntil: null,
      activeSeconds: 1000,
      lastSummarizedActiveSeconds: 0,
      pendingTranscript: [
        {
          eventId: 'event-id',
          role: 'user',
          text: 'private transcript',
          occurredAt: '2026-10-24T00:00:00.000Z',
        },
      ],
    } as AiTutorLiveSession;
    const updateSession = jest.fn().mockResolvedValue({ affected: 1 });
    const queryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const sessionRepository = {
      find: jest.fn().mockResolvedValue([session]),
      findOne: jest.fn().mockResolvedValue(session),
      update: updateSession,
      createQueryBuilder: jest.fn().mockReturnValue(queryBuilder),
    } as unknown as Repository<AiTutorLiveSession>;
    const generateStructuredSummary = jest.fn();
    const service = new AiTutorLiveSessionService(
      sessionRepository,
      {} as Repository<AiTutorLearningMemory>,
      {} as Repository<AiTutorLearnerProfile>,
      new ConfigService({}),
      { generateStructuredSummary } as unknown as GeminiLiveService,
      {} as DataSource,
      {
        hasCurrentConsent: jest.fn().mockResolvedValue(false),
      } as unknown as AiConsentService,
    );

    await service.processDueSummaries();

    expect(generateStructuredSummary).not.toHaveBeenCalled();
    expect(updateSession).toHaveBeenCalledWith(
      { id: session.id },
      expect.objectContaining({
        status: AiTutorLiveSessionStatus.FAILED,
        pendingTranscript: [],
        resumptionHandle: null,
      }),
    );
  });
});
