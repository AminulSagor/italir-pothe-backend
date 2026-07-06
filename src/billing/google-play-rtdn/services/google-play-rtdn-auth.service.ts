import {
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

@Injectable()
export class GooglePlayRtdnAuthService implements OnModuleInit {
  private readonly logger = new Logger(GooglePlayRtdnAuthService.name);

  private readonly oauthClient = new OAuth2Client();

  private readonly audience: string;

  private readonly expectedServiceAccountEmail: string;

  constructor(private readonly configService: ConfigService) {
    this.audience =
      this.configService.get<string>('GOOGLE_PLAY_RTDN_AUDIENCE')?.trim() ?? '';

    this.expectedServiceAccountEmail =
      this.configService
        .get<string>('GOOGLE_PLAY_RTDN_PUSH_SERVICE_ACCOUNT_EMAIL')
        ?.trim()
        .toLowerCase() ?? '';
  }

  onModuleInit(): void {
    if (!this.audience) {
      throw new Error('GOOGLE_PLAY_RTDN_AUDIENCE is required.');
    }

    if (!this.expectedServiceAccountEmail) {
      throw new Error(
        'GOOGLE_PLAY_RTDN_PUSH_SERVICE_ACCOUNT_EMAIL is required.',
      );
    }
  }

  async assertAuthorized(authorizationHeader?: string): Promise<void> {
    const token = this.extractBearerToken(authorizationHeader);

    try {
      const ticket = await this.oauthClient.verifyIdToken({
        idToken: token,
        audience: this.audience,
      });

      const payload = ticket.getPayload();

      if (!payload) {
        throw new UnauthorizedException(
          'Google Pub/Sub authentication payload is missing.',
        );
      }

      const email = payload.email?.trim().toLowerCase() ?? '';

      if (email !== this.expectedServiceAccountEmail) {
        this.logger.warn(`Rejected Pub/Sub identity: ${email || 'missing'}`);

        throw new UnauthorizedException(
          'Unexpected Google Pub/Sub service account.',
        );
      }

      if (payload.email_verified !== true) {
        throw new UnauthorizedException(
          'Google Pub/Sub service account email is not verified.',
        );
      }

      if (
        payload.iss !== 'accounts.google.com' &&
        payload.iss !== 'https://accounts.google.com'
      ) {
        throw new UnauthorizedException(
          'Unexpected Google Pub/Sub token issuer.',
        );
      }
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      this.logger.warn(
        `Google Pub/Sub authentication failed: ${
          error instanceof Error ? error.message : 'Unknown verification error'
        }`,
      );

      throw new UnauthorizedException(
        'Invalid Google Pub/Sub authentication token.',
      );
    }
  }

  private extractBearerToken(authorizationHeader?: string): string {
    if (!authorizationHeader) {
      throw new UnauthorizedException('Authorization header is required.');
    }

    const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);

    const token = match?.[1]?.trim();

    if (!token) {
      throw new UnauthorizedException('A valid Bearer token is required.');
    }

    return token;
  }
}
