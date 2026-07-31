import { getSignedCookies } from '@aws-sdk/cloudfront-signer';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { posix as pathPosix } from 'node:path';

@Injectable()
export class CloudFrontSignerService {
  private readonly enabled: boolean;
  private readonly baseUrl?: string;
  private readonly keyPairId?: string;
  private readonly privateKey?: string;
  private readonly expiresInSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.enabled =
      this.configService
        .get<string>('CLOUDFRONT_SIGNED_COOKIES_ENABLED')
        ?.trim()
        .toLowerCase() === 'true';

    this.baseUrl = this.configService
      .get<string>('AWS_CLOUDFRONT_BASE_URL')
      ?.trim()
      .replace(/\/$/, '');

    this.keyPairId = this.configService
      .get<string>('CLOUDFRONT_KEY_PAIR_ID')
      ?.trim();

    const privateKeyBase64 = this.configService
      .get<string>('CLOUDFRONT_PRIVATE_KEY_BASE64')
      ?.trim();

    this.privateKey = privateKeyBase64
      ? Buffer.from(privateKeyBase64, 'base64').toString('utf8')
      : undefined;

    this.expiresInSeconds = this.getPositiveInteger(
      'CLOUDFRONT_COOKIE_EXPIRES_SECONDS',
      3600,
    );
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  createSignedCookiesForHlsMaster(hlsMasterKey: string) {
    if (!this.enabled) {
      return null;
    }

    if (!this.baseUrl || !this.keyPairId || !this.privateKey) {
      throw new InternalServerErrorException(
        'CloudFront signed-cookie configuration is incomplete.',
      );
    }

    const hlsDirectory = pathPosix.dirname(hlsMasterKey);
    const resource = `${this.baseUrl}/${hlsDirectory}/*`;
    const expiresAt = new Date(Date.now() + this.expiresInSeconds * 1000);

    const policy = JSON.stringify({
      Statement: [
        {
          Resource: resource,
          Condition: {
            DateLessThan: {
              'AWS:EpochTime': Math.floor(expiresAt.getTime() / 1000),
            },
          },
        },
      ],
    });

    const cookies = getSignedCookies({
      keyPairId: this.keyPairId,
      privateKey: this.privateKey,
      policy,
    });

    return {
      cookies,
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: this.expiresInSeconds,
      resource,
    };
  }

  private getPositiveInteger(
    environmentName: string,
    fallbackValue: number,
  ): number {
    const configuredValue = this.configService
      .get<string>(environmentName)
      ?.trim();

    if (!configuredValue) {
      return fallbackValue;
    }

    const parsedValue = Number(configuredValue);

    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
      throw new InternalServerErrorException(
        `${environmentName} must be a positive safe integer.`,
      );
    }

    return parsedValue;
  }
}
