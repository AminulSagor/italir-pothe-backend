import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';

import { AiTutorLiveSessionStatus } from '../ai-tutor/entities/ai-tutor-live-session.entity';
import {
  AiTutorVoiceUsageSession,
  AiTutorVoiceUsageStatus,
} from '../ai-tutor/entities/ai-tutor-voice-usage-session.entity';
import { StoreWalletService } from '../package-store/services/store-wallet.service';
import { AiConsentSessionRevocationService } from './ai-consent-session-revocation.service';

describe('AiConsentSessionRevocationService', () => {
  it('finalizes billing and invalidates a direct Gemini session atomically', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-24T00:00:10Z'));
    const usage = {
      id: '11111111-1111-1111-1111-111111111111',
      userId: 'user-id',
      providerSessionId: '11111111-1111-1111-1111-111111111111',
      status: AiTutorVoiceUsageStatus.ACTIVE,
      allocatedSeconds: 60,
      usedSeconds: 10,
      lastHeartbeatAt: new Date('2026-10-24T00:00:05Z'),
      endedAt: null,
    } as AiTutorVoiceUsageSession;
    const live = {
      usageSessionId: usage.id,
      status: AiTutorLiveSessionStatus.ACTIVE,
      activeSeconds: 0,
      endedAt: null,
      summaryLeaseUntil: null,
      resumptionHandle: 'provider-handle',
    };
    const usageRepository = {
      find: jest.fn().mockResolvedValue([usage]),
      save: jest.fn().mockResolvedValue([usage]),
    };
    const liveRepository = {
      find: jest.fn().mockResolvedValue([live]),
      save: jest.fn().mockResolvedValue([live]),
    };
    const manager = {
      getRepository: jest.fn((entity: unknown) =>
        entity === AiTutorVoiceUsageSession ? usageRepository : liveRepository,
      ),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        Promise.resolve(callback(manager)),
      ),
    } as unknown as DataSource;
    const consumeAiVoiceSeconds = jest.fn().mockResolvedValue({});
    const wallet = {
      getBalancesWithManager: jest.fn().mockResolvedValue({
        ai: { voiceSeconds: 100 },
      }),
      consumeAiVoiceSeconds,
    } as unknown as StoreWalletService;
    const service = new AiConsentSessionRevocationService(
      wallet,
      dataSource,
      new ConfigService({}),
    );

    const result = await service.revokeUserSessions('user-id');

    expect(consumeAiVoiceSeconds).toHaveBeenCalledWith('user-id', 5, manager);
    expect(usage).toMatchObject({
      status: AiTutorVoiceUsageStatus.ENDED,
      usedSeconds: 15,
    });
    expect(live).toMatchObject({
      status: AiTutorLiveSessionStatus.FAILED,
      activeSeconds: 15,
      pendingTranscript: [],
      resumptionHandle: null,
    });
    expect(result).toEqual({
      invalidatedSessions: 1,
      workerTerminationAttempts: 0,
      workerTerminationFailures: 0,
    });
    jest.useRealTimers();
  });
});
