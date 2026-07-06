import { Injectable, OnModuleInit } from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

@Injectable()
export class AppStorePayloadCipherService implements OnModuleInit {
  private encryptionKey!: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const encodedKey =
      this.configService
        .get<string>('APP_STORE_NOTIFICATION_ENCRYPTION_KEY')
        ?.trim() ?? '';

    if (!encodedKey) {
      throw new Error('APP_STORE_NOTIFICATION_ENCRYPTION_KEY is required.');
    }

    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 32) {
      throw new Error(
        'APP_STORE_NOTIFICATION_ENCRYPTION_KEY must decode to exactly 32 bytes.',
      );
    }

    this.encryptionKey = key;
  }

  encryptText(value: string): {
    ciphertext: string;
    iv: string;
    authTag: string;
  } {
    const normalized = value.trim();

    if (!normalized) {
      throw new Error('A non-empty value is required for encryption.');
    }

    const iv = randomBytes(12);

    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);

    const ciphertext = Buffer.concat([
      cipher.update(Buffer.from(normalized, 'utf8')),

      cipher.final(),
    ]);

    return {
      ciphertext: ciphertext.toString('base64'),

      iv: iv.toString('base64'),

      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decryptText(params: {
    ciphertext: string;
    iv: string;
    authTag: string;
  }): string {
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

    return plaintext.toString('utf8');
  }
}
