import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import type { EncryptedGooglePlayPayload } from 'src/billing/types/google-play-rtdn.type';

@Injectable()
export class GooglePlayRtdnCipherService implements OnModuleInit {
  private encryptionKey: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.encryptionKey = this.loadEncryptionKey();
  }

  encryptJson(payload: unknown): EncryptedGooglePlayPayload {
    const iv = randomBytes(12);

    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');

    const ciphertext = Buffer.concat([
      cipher.update(plaintext),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
    };
  }

  decryptJson<T>(params: {
    ciphertext: string;
    iv: string;
    authTag: string;
  }): T {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(params.iv, 'base64'),
    );

    decipher.setAuthTag(Buffer.from(params.authTag, 'base64'));

    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(params.ciphertext, 'base64')),
      decipher.final(),
    ]);

    return JSON.parse(plaintext.toString('utf8')) as T;
  }

  private loadEncryptionKey(): Buffer {
    const encodedKey =
      this.configService
        .get<string>('GOOGLE_PLAY_RTDN_ENCRYPTION_KEY')
        ?.trim() ?? '';

    if (!encodedKey) {
      throw new Error('GOOGLE_PLAY_RTDN_ENCRYPTION_KEY is required.');
    }

    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32) {
      throw new Error(
        'GOOGLE_PLAY_RTDN_ENCRYPTION_KEY must decode to exactly 32 bytes.',
      );
    }

    return key;
  }
}
