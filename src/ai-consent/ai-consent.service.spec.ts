import { DataSource, Repository } from 'typeorm';

import { UserDeviceService } from '../devices/services/user-device.service';
import { AiConsentSessionRevocationService } from './ai-consent-session-revocation.service';
import { AiConsentService } from './ai-consent.service';
import { UserAiConsent } from './entities/user-ai-consent.entity';

describe('AiConsentService withdrawal', () => {
  function fixture(options: { cleanupRejects?: boolean } = {}) {
    const consent = {
      userId: 'user-id',
      version: '2026-10-04',
      grantedAt: new Date('2026-10-01T00:00:00Z'),
      revokedAt: null,
    } as UserAiConsent;
    const saveConsent = jest
      .fn()
      .mockImplementation((value) => Promise.resolve(value as UserAiConsent));
    const repository = {
      findOne: jest.fn().mockResolvedValue(consent),
      save: saveConsent,
    } as unknown as Repository<UserAiConsent>;
    const revokeUserSessions = options.cleanupRejects
      ? jest.fn().mockRejectedValue(new Error('cleanup unavailable'))
      : jest.fn().mockResolvedValue({
          invalidatedSessions: 1,
          workerTerminationAttempts: 0,
          workerTerminationFailures: 0,
        });
    const sessionRevocation = {
      revokeUserSessions,
    } as unknown as AiConsentSessionRevocationService;
    const manager = {
      query: jest.fn().mockResolvedValue(undefined),
      getRepository: jest.fn().mockReturnValue(repository),
    };
    const dataSource = {
      transaction: jest.fn((callback: (value: typeof manager) => unknown) =>
        Promise.resolve(callback(manager)),
      ),
    } as unknown as DataSource;
    const service = new AiConsentService(
      repository,
      {} as UserDeviceService,
      sessionRevocation,
      dataSource,
    );
    return { consent, revokeUserSessions, saveConsent, service };
  }

  it('persists revocation before invalidating active voice sessions', async () => {
    const subject = fixture();

    const result = await subject.service.revoke('user-id');

    expect(subject.consent.revokedAt).toBeInstanceOf(Date);
    expect(subject.saveConsent).toHaveBeenCalledWith(subject.consent);
    expect(subject.revokeUserSessions).toHaveBeenCalledWith('user-id');
    expect(result).toMatchObject({
      granted: false,
      sessionInvalidation: { invalidatedSessions: 1 },
    });
  });

  it('still confirms the persisted withdrawal when proactive cleanup fails', async () => {
    const subject = fixture({ cleanupRejects: true });

    await expect(subject.service.revoke('user-id')).resolves.toMatchObject({
      granted: false,
      sessionInvalidation: null,
    });
  });
});
