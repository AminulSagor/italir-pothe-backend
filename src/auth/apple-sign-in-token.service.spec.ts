import { ConfigService } from '@nestjs/config';
import { generateKeyPairSync } from 'node:crypto';

import { AppleSignInTokenService } from './apple-sign-in-token.service';

describe('AppleSignInTokenService', () => {
  const { privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const config = new Map<string, string>([
    ['APPLE_CLIENT_ID', 'com.example.app'],
    ['APPLE_SIGN_IN_TEAM_ID', 'TEAM123456'],
    ['APPLE_SIGN_IN_KEY_ID', 'KEY1234567'],
    [
      'APPLE_SIGN_IN_PRIVATE_KEY',
      privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    ],
    [
      'APPLE_SIGN_IN_TOKEN_ENCRYPTION_KEY',
      Buffer.alloc(32, 7).toString('base64'),
    ],
  ]);

  const configService = {
    get: jest.fn((key: string) => config.get(key)),
  } as unknown as ConfigService;

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exchanges the authorization code, encrypts the refresh token, and revokes it', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ refresh_token: 'refresh-token-value' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(new Response('', { status: 200 }));
    const service = new AppleSignInTokenService(configService);

    const encrypted =
      await service.exchangeAndEncryptAuthorizationCode('one-time-code');

    expect(encrypted.ciphertext).not.toContain('refresh-token-value');
    const exchangeRequest = fetchMock.mock.calls[0][1] as RequestInit;
    expect(typeof exchangeRequest.body).toBe('string');
    const exchangeBody = new URLSearchParams(exchangeRequest.body as string);
    expect(exchangeBody.get('code')).toBe('one-time-code');
    expect(exchangeBody.get('grant_type')).toBe('authorization_code');

    await service.revokeEncryptedRefreshToken(encrypted);

    const revokeRequest = fetchMock.mock.calls[1][1] as RequestInit;
    expect(typeof revokeRequest.body).toBe('string');
    const revokeBody = new URLSearchParams(revokeRequest.body as string);
    expect(revokeBody.get('token')).toBe('refresh-token-value');
    expect(revokeBody.get('token_type_hint')).toBe('refresh_token');
  });

  it('rejects Apple sign-in when the authorization code is missing', async () => {
    const service = new AppleSignInTokenService(configService);

    await expect(
      service.exchangeAndEncryptAuthorizationCode(undefined),
    ).rejects.toThrow('Apple authorization code is required');
  });
});
