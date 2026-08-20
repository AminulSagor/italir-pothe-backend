import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHmac,
  createPublicKey,
  type JsonWebKey as NodeJsonWebKey,
  verify as verifySignature,
} from 'crypto';
import { OAuth2Client } from 'google-auth-library';

import { SocialAuthProvider } from './entities/user-social-account.entity';

export interface VerifiedSocialIdentity {
  provider: SocialAuthProvider;
  providerUserId: string;
  email: string | null;
  emailVerified: boolean;
  fullName: string;
  avatarUrl: string | null;
}

@Injectable()
export class SocialTokenVerifierService {
  private readonly logger = new Logger(SocialTokenVerifierService.name);
  private facebookJwksCache:
    | { expiresAt: number; keys: Array<Record<string, unknown>> }
    | undefined;

  constructor(private readonly configService: ConfigService) {}

  async verify(
    provider: SocialAuthProvider,
    token: string,
    tokenType?: 'classic' | 'limited',
    nonce?: string,
  ): Promise<VerifiedSocialIdentity> {
    return provider === SocialAuthProvider.GOOGLE
      ? this.verifyGoogle(token)
      : this.verifyFacebook(token, tokenType, nonce);
  }

  private async verifyGoogle(idToken: string): Promise<VerifiedSocialIdentity> {
    const clientId = this.requiredConfig('GOOGLE_CLIENT_ID');

    try {
      const ticket = await new OAuth2Client(clientId).verifyIdToken({
        idToken,
        audience: clientId,
      });
      const payload = ticket.getPayload();

      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid Google identity token.');
      }

      const emailVerified = payload.email_verified === true;
      const email = emailVerified
        ? this.normalizeEmail(payload.email ?? null)
        : null;

      return {
        provider: SocialAuthProvider.GOOGLE,
        providerUserId: payload.sub,
        email,
        emailVerified,
        fullName: payload.name?.trim() || email?.split('@')[0] || 'Google user',
        avatarUrl: payload.picture?.trim() || null,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.logger.warn('Google sign-in token verification failed.');
      throw new UnauthorizedException('Invalid or expired Google token.');
    }
  }

  private async verifyFacebook(
    accessToken: string,
    tokenType?: 'classic' | 'limited',
    nonce?: string,
  ): Promise<VerifiedSocialIdentity> {
    const appId = this.requiredConfig('FACEBOOK_APP_ID');
    const looksLikeJwt = accessToken.split('.').length === 3;
    if (tokenType === 'limited' || looksLikeJwt) {
      return this.verifyFacebookLimitedToken(accessToken, appId, nonce);
    }

    const appSecret = this.requiredConfig('FACEBOOK_APP_SECRET');
    const version =
      this.configService.get<string>('FACEBOOK_GRAPH_API_VERSION')?.trim() ||
      'v23.0';
    const graphBase = `https://graph.facebook.com/${version}`;
    const appAccessToken = `${appId}|${appSecret}`;

    try {
      const debug = await this.fetchJson<{
        data?: {
          app_id?: string;
          user_id?: string;
          is_valid?: boolean;
          expires_at?: number;
        };
      }>(
        `${graphBase}/debug_token?${new URLSearchParams({
          input_token: accessToken,
          access_token: appAccessToken,
        })}`,
      );
      const data = debug.data;
      const expired =
        typeof data?.expires_at === 'number' &&
        data.expires_at > 0 &&
        data.expires_at * 1000 <= Date.now();

      if (
        data?.is_valid !== true ||
        data.app_id !== appId ||
        !data.user_id ||
        expired
      ) {
        throw new UnauthorizedException('Invalid Facebook access token.');
      }

      const appSecretProof = createHmac('sha256', appSecret)
        .update(accessToken)
        .digest('hex');
      const profile = await this.fetchJson<{
        id?: string;
        name?: string;
        email?: string;
        picture?: { data?: { url?: string } };
      }>(
        `${graphBase}/me?${new URLSearchParams({
          fields: 'id,name,email,picture.type(large)',
          access_token: accessToken,
          appsecret_proof: appSecretProof,
        })}`,
      );

      if (!profile.id || profile.id !== data.user_id) {
        throw new UnauthorizedException('Invalid Facebook identity.');
      }

      const email = this.normalizeEmail(profile.email ?? null);

      return {
        provider: SocialAuthProvider.FACEBOOK,
        providerUserId: profile.id,
        email,
        emailVerified: email !== null,
        fullName:
          profile.name?.trim() || email?.split('@')[0] || 'Facebook user',
        avatarUrl: profile.picture?.data?.url?.trim() || null,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.warn('Facebook sign-in token verification failed.');
      throw new UnauthorizedException('Invalid or expired Facebook token.');
    }
  }

  private async verifyFacebookLimitedToken(
    token: string,
    appId: string,
    expectedNonce?: string,
  ): Promise<VerifiedSocialIdentity> {
    try {
      const parts = token.split('.');
      if (parts.length !== 3 || !expectedNonce?.trim()) {
        throw new UnauthorizedException(
          'Invalid Facebook Limited Login token.',
        );
      }

      const header = this.decodeJwtPart<{ alg?: string; kid?: string }>(
        parts[0],
      );
      const payload = this.decodeJwtPart<{
        iss?: string;
        aud?: string | string[];
        sub?: string;
        exp?: number;
        iat?: number;
        nonce?: string;
        name?: string;
        email?: string;
        picture?: string | { data?: { url?: string } };
      }>(parts[1]);

      if (header.alg !== 'RS256' || !header.kid) {
        throw new UnauthorizedException('Invalid Facebook token algorithm.');
      }
      const jwks = await this.getFacebookJwks();
      const jwk = jwks.find((value) => value.kid === header.kid);
      if (!jwk) {
        this.facebookJwksCache = undefined;
        throw new UnauthorizedException('Unknown Facebook signing key.');
      }

      const publicKey = createPublicKey({
        key: jwk as NodeJsonWebKey,
        format: 'jwk',
      });
      const signatureValid = verifySignature(
        'RSA-SHA256',
        Buffer.from(`${parts[0]}.${parts[1]}`),
        publicKey,
        Buffer.from(parts[2], 'base64url'),
      );
      const audienceValid = Array.isArray(payload.aud)
        ? payload.aud.includes(appId)
        : payload.aud === appId;
      const nowSeconds = Math.floor(Date.now() / 1000);

      if (
        !signatureValid ||
        payload.iss !== 'https://www.facebook.com' ||
        !audienceValid ||
        !payload.sub ||
        typeof payload.exp !== 'number' ||
        payload.exp <= nowSeconds - 60 ||
        (typeof payload.iat === 'number' && payload.iat > nowSeconds + 60) ||
        payload.nonce !== expectedNonce.trim()
      ) {
        throw new UnauthorizedException(
          'Invalid or expired Facebook Limited Login token.',
        );
      }

      const email = this.normalizeEmail(payload.email ?? null);
      const picture =
        typeof payload.picture === 'string'
          ? payload.picture
          : payload.picture?.data?.url;

      return {
        provider: SocialAuthProvider.FACEBOOK,
        providerUserId: payload.sub,
        email,
        emailVerified: email !== null,
        fullName:
          payload.name?.trim() || email?.split('@')[0] || 'Facebook user',
        avatarUrl: picture?.trim() || null,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      this.logger.warn('Facebook Limited Login token verification failed.');
      throw new UnauthorizedException(
        'Invalid or expired Facebook Limited Login token.',
      );
    }
  }

  private async getFacebookJwks(): Promise<Array<Record<string, unknown>>> {
    if (
      this.facebookJwksCache &&
      this.facebookJwksCache.expiresAt > Date.now()
    ) {
      return this.facebookJwksCache.keys;
    }

    const response = await this.fetchJson<{
      keys?: Array<Record<string, unknown>>;
    }>('https://www.facebook.com/.well-known/oauth/openid/jwks/');
    if (!Array.isArray(response.keys) || response.keys.length === 0) {
      throw new ServiceUnavailableException(
        'Facebook signing keys are temporarily unavailable.',
      );
    }
    this.facebookJwksCache = {
      keys: response.keys,
      expiresAt: Date.now() + 60 * 60 * 1000,
    };
    return response.keys;
  }

  private decodeJwtPart<T>(value: string): T {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  }

  private async fetchJson<T>(url: string): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        if (response.status >= 500 || response.status === 429) {
          throw new ServiceUnavailableException(
            'Social login provider is temporarily unavailable.',
          );
        }
        throw new UnauthorizedException('Provider token verification failed.');
      }
      return (await response.json()) as T;
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof ServiceUnavailableException
      ) {
        throw error;
      }
      throw new ServiceUnavailableException(
        'Social login provider is temporarily unavailable.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  private requiredConfig(name: string): string {
    const value = this.configService.get<string>(name)?.trim();
    if (!value) {
      this.logger.error(`${name} is not configured.`);
      throw new ServiceUnavailableException('Social login is not configured.');
    }
    return value;
  }

  private normalizeEmail(value: string | null): string | null {
    const normalized = value?.trim().toLowerCase() ?? '';
    return normalized || null;
  }
}
