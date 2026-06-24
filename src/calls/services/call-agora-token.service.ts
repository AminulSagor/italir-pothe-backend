import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomInt, randomUUID } from 'crypto';

const {
  RtcRole,
  RtcTokenBuilder,
}: {
  RtcRole: {
    PUBLISHER: number;
  };

  RtcTokenBuilder: {
    buildTokenWithUid: (
      appId: string,
      appCertificate: string,
      channelName: string,
      uid: number,
      role: number,
      privilegeExpiredTs: number,
    ) => string;
  };
} = require('agora-access-token');

export interface CallAgoraCredentials {
  appId: string;
  channelName: string;
  uid: number;
  token: string;
  expiresAt: number;
}

@Injectable()
export class CallAgoraTokenService {
  constructor(private readonly configService: ConfigService) {}

  createChannelName(): string {
    return `call_${randomUUID().replace(/-/g, '')}`.slice(0, 64);
  }

  createAgoraUid(): number {
    return randomInt(1, 2_147_483_647);
  }

  buildPublisherToken(params: {
    channelName: string;
    uid: number;
  }): CallAgoraCredentials {
    const appId = this.getRequiredValue('AGORA_APP_ID');

    const appCertificate = this.getRequiredValue('AGORA_APP_CERTIFICATE');

    const expiresIn = this.getExpireSeconds();

    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;

    const token = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      params.channelName,
      params.uid,
      RtcRole.PUBLISHER,
      expiresAt,
    );

    return {
      appId,
      channelName: params.channelName,
      uid: params.uid,
      token,
      expiresAt,
    };
  }

  private getRequiredValue(key: string): string {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured`);
    }

    return value;
  }

  private getExpireSeconds(): number {
    const value = Number(
      this.configService.get<string>('AGORA_TOKEN_EXPIRE_SECONDS') ?? 3600,
    );

    if (!Number.isInteger(value) || value <= 0 || value > 86_400) {
      throw new InternalServerErrorException(
        'AGORA_TOKEN_EXPIRE_SECONDS must be between 1 and 86400',
      );
    }

    return value;
  }
}
