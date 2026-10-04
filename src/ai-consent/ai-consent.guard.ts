import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { DevicePlatform } from 'src/devices/enums/device.enums';
import { UserDeviceService } from 'src/devices/services/user-device.service';
import { AiConsentService } from './ai-consent.service';

@Injectable()
export class AiConsentGuard implements CanActivate {
  private static readonly consentCapability = 'ai-consent-v1';

  constructor(
    private readonly aiConsentService: AiConsentService,
    private readonly userDeviceService: UserDeviceService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId)
      throw new UnauthorizedException('Authenticated user is required.');

    if (await this.aiConsentService.hasCurrentConsent(userId)) return true;

    // The Play Store build published before the consent UI existed cannot
    // create a consent record. Preserve its AI functionality only when the
    // authenticated session belongs to Android and the request does not claim
    // the consent-aware capability. Updated Android builds and every iOS/web
    // client remain subject to explicit consent enforcement.
    if (
      !this.isConsentAwareClient(request) &&
      (await this.isAuthenticatedLegacyAndroidClient(request, userId))
    ) {
      return true;
    }

    throw new ForbiddenException({
      code: 'AI_CONSENT_REQUIRED',
      message:
        'Permission is required before sharing data with third-party AI providers.',
    });
  }

  private isConsentAwareClient(request: AuthenticatedRequest): boolean {
    const rawHeader = request.headers['x-italir-client-capabilities'];
    const header = Array.isArray(rawHeader) ? rawHeader.join(',') : rawHeader;
    return (header ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .includes(AiConsentGuard.consentCapability);
  }

  private async isAuthenticatedLegacyAndroidClient(
    request: AuthenticatedRequest,
    userId: string,
  ): Promise<boolean> {
    const deviceId = request.user?.deviceId?.trim();
    const sessionId = request.user?.sessionId?.trim();
    if (!deviceId || !sessionId) return false;

    const device = await this.userDeviceService.assertAuthSessionActive({
      userId,
      deviceId,
      sessionId,
    });
    return device.platform === DevicePlatform.ANDROID;
  }
}
