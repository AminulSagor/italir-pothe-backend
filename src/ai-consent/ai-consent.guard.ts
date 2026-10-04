import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { AiConsentService } from './ai-consent.service';

@Injectable()
export class AiConsentGuard implements CanActivate {
  private static readonly consentCapability = 'ai-consent-v1';

  constructor(private readonly aiConsentService: AiConsentService) {}

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
      (await this.aiConsentService.isAuthenticatedLegacyAndroidClient({
        userId,
        deviceId: request.user?.deviceId,
        sessionId: request.user?.sessionId,
      }))
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
}
