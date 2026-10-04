import { ExecutionContext, ForbiddenException } from '@nestjs/common';

import { DevicePlatform } from '../devices/enums/device.enums';
import { UserDeviceService } from '../devices/services/user-device.service';
import { AiConsentGuard } from './ai-consent.guard';
import { AiConsentService } from './ai-consent.service';

describe('AiConsentGuard', () => {
  const context = (capabilities?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            id: 'user-id',
            deviceId: 'device-id',
            sessionId: 'session-id',
          },
          headers: capabilities
            ? { 'x-italir-client-capabilities': capabilities }
            : {},
        }),
      }),
    }) as ExecutionContext;

  const createGuard = (params: {
    hasConsent: boolean;
    platform: DevicePlatform;
  }) =>
    new AiConsentGuard(
      {
        hasCurrentConsent: jest.fn().mockResolvedValue(params.hasConsent),
      } as unknown as AiConsentService,
      {
        assertAuthSessionActive: jest.fn().mockResolvedValue({
          platform: params.platform,
        }),
      } as unknown as UserDeviceService,
    );

  it('allows a legacy Android client without a consent record', async () => {
    const guard = createGuard({
      hasConsent: false,
      platform: DevicePlatform.ANDROID,
    });

    await expect(guard.canActivate(context())).resolves.toBe(true);
  });

  it('requires consent from an updated Android client', async () => {
    const guard = createGuard({
      hasConsent: false,
      platform: DevicePlatform.ANDROID,
    });

    await expect(
      guard.canActivate(context('other, ai-consent-v1')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not grant the legacy exception to iOS', async () => {
    const guard = createGuard({
      hasConsent: false,
      platform: DevicePlatform.IOS,
    });

    await expect(guard.canActivate(context())).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows any authenticated client after consent is recorded', async () => {
    const guard = createGuard({
      hasConsent: true,
      platform: DevicePlatform.IOS,
    });

    await expect(guard.canActivate(context('ai-consent-v1'))).resolves.toBe(
      true,
    );
  });
});
