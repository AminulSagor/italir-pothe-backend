import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  randomBytes,
  sign,
} from 'node:crypto';

export interface EncryptedAppleRefreshToken {
  ciphertext: string;
  iv: string;
  authTag: string;
}

interface AppleTokenResponse {
  refresh_token?: string;
  error?: string;
  error_description?: string;
}

@Injectable()
export class AppleSignInTokenService {
  private readonly logger = new Logger(AppleSignInTokenService.name);
  private readonly appleTokenUrl = 'https://appleid.apple.com/auth/token';
  private readonly appleRevokeUrl = 'https://appleid.apple.com/auth/revoke';

  constructor(private readonly configService: ConfigService) {}

  async exchangeAndEncryptAuthorizationCode(
    authorizationCode: string | undefined,
  ): Promise<EncryptedAppleRefreshToken> {
    const code = authorizationCode?.trim() ?? '';
    if (!code) {
      throw new BadRequestException(
        'Apple authorization code is required for account deletion support.',
      );
    }

    const body = new URLSearchParams({
      client_id: this.required('APPLE_CLIENT_ID'),
      client_secret: this.createClientSecret(),
      code,
      grant_type: 'authorization_code',
    });
    const redirectUri = this.configService
      .get<string>('APPLE_SIGN_IN_REDIRECT_URI')
      ?.trim();
    if (redirectUri) body.set('redirect_uri', redirectUri);

    const response = await this.postForm(this.appleTokenUrl, body);
    if (!response.ok) {
      const payload = await this.readResponse(response);
      this.logger.warn(
        `Apple authorization-code exchange failed status=${response.status} error=${payload.error ?? 'unknown'}`,
      );
      if (response.status === 400 || response.status === 401) {
        throw new UnauthorizedException(
          'Apple authorization code is invalid or expired.',
        );
      }
      throw new BadGatewayException(
        'Sign in with Apple is temporarily unavailable.',
      );
    }

    const payload = await this.readResponse(response);
    const refreshToken = payload.refresh_token?.trim() ?? '';
    if (!refreshToken) {
      this.logger.error(
        'Apple token response did not contain a refresh token.',
      );
      throw new BadGatewayException(
        'Apple did not return the account-deletion credential.',
      );
    }

    return this.encrypt(refreshToken);
  }

  async revokeEncryptedRefreshToken(
    encrypted: EncryptedAppleRefreshToken,
  ): Promise<void> {
    const refreshToken = this.decrypt(encrypted);
    const response = await this.postForm(
      this.appleRevokeUrl,
      new URLSearchParams({
        client_id: this.required('APPLE_CLIENT_ID'),
        client_secret: this.createClientSecret(),
        token: refreshToken,
        token_type_hint: 'refresh_token',
      }),
    );

    if (!response.ok) {
      const payload = await this.readResponse(response);
      this.logger.error(
        `Apple token revocation failed status=${response.status} error=${payload.error ?? 'unknown'}`,
      );
      throw new BadGatewayException(
        'Apple account authorization could not be revoked. Please retry account deletion.',
      );
    }
  }

  private encrypt(value: string): EncryptedAppleRefreshToken {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey(), iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  private decrypt(encrypted: EncryptedAppleRefreshToken): string {
    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.encryptionKey(),
        Buffer.from(encrypted.iv, 'base64'),
      );
      decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      this.logger.error('Stored Apple refresh token could not be decrypted.');
      throw new BadGatewayException(
        'Apple account authorization could not be revoked. Please contact support.',
        { cause: error },
      );
    }
  }

  private createClientSecret(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = this.encodeJson({
      alg: 'ES256',
      kid: this.required('APPLE_SIGN_IN_KEY_ID'),
      typ: 'JWT',
    });
    const payload = this.encodeJson({
      iss: this.required('APPLE_SIGN_IN_TEAM_ID'),
      iat: now - 30,
      exp: now + 300,
      aud: 'https://appleid.apple.com',
      sub: this.required('APPLE_CLIENT_ID'),
    });
    const signingInput = `${header}.${payload}`;

    try {
      const privateKey = createPrivateKey(
        this.required('APPLE_SIGN_IN_PRIVATE_KEY').replace(/\\n/g, '\n'),
      );
      const signature = sign('sha256', Buffer.from(signingInput), {
        key: privateKey,
        dsaEncoding: 'ieee-p1363',
      });
      return `${signingInput}.${signature.toString('base64url')}`;
    } catch (error) {
      this.logger.error('APPLE_SIGN_IN_PRIVATE_KEY is invalid.');
      throw new BadGatewayException(
        'Sign in with Apple server credentials are invalid.',
        { cause: error },
      );
    }
  }

  private encryptionKey(): Buffer {
    const value = this.required('APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY');
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) {
      throw new Error(
        'APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.',
      );
    }
    return key;
  }

  private async postForm(url: string, body: URLSearchParams) {
    try {
      return await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      this.logger.error(
        `Apple request failed endpoint=${new URL(url).pathname}`,
      );
      throw new BadGatewayException(
        'Sign in with Apple is temporarily unavailable.',
        { cause: error },
      );
    }
  }

  private async readResponse(response: Response): Promise<AppleTokenResponse> {
    try {
      return (await response.json()) as AppleTokenResponse;
    } catch {
      return {};
    }
  }

  private encodeJson(value: Record<string, string | number>): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private required(key: string): string {
    const value = this.configService.get<string>(key)?.trim() ?? '';
    if (!value) throw new Error(`${key} is required.`);
    return value;
  }
}
