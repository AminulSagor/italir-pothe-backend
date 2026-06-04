import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RtcRole, RtcTokenBuilder } from 'agora-access-token';

export enum AgoraLiveRole {
  PUBLISHER = 'publisher',
  SUBSCRIBER = 'subscriber',
}

export interface AgoraRtcTokenResponse {
  appId: string;
  channelName: string;
  uid: number;
  role: AgoraLiveRole;
  rtcToken: string;
  expiresIn: number;
  expiresAt: number;
}

@Injectable()
export class AgoraTokenService {
  constructor(private readonly configService: ConfigService) {}

  buildRtcToken(params: {
    channelName: string;
    uid: number;
    role: AgoraLiveRole;
  }): AgoraRtcTokenResponse {
    const appId = this.getRequiredConfig('AGORA_APP_ID');
    const appCertificate = this.getRequiredConfig('AGORA_APP_CERTIFICATE');
    const expiresIn = this.getTokenExpireSeconds();
    const expiresAt = Math.floor(Date.now() / 1000) + expiresIn;
    const agoraRole =
      params.role === AgoraLiveRole.PUBLISHER
        ? RtcRole.PUBLISHER
        : RtcRole.SUBSCRIBER;

    const rtcToken = RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      params.channelName,
      params.uid,
      agoraRole,
      expiresAt,
    );

    return {
      appId,
      channelName: params.channelName,
      uid: params.uid,
      role: params.role,
      rtcToken,
      expiresIn,
      expiresAt,
    };
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key)?.trim();

    if (!value) {
      throw new InternalServerErrorException(`${key} is not configured.`);
    }

    return value;
  }

  private getTokenExpireSeconds(): number {
    const rawValue = this.configService.get<string>('AGORA_TOKEN_EXPIRE_SECONDS');
    const parsedValue = Number(rawValue ?? 3600);

    if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
      throw new InternalServerErrorException(
        'AGORA_TOKEN_EXPIRE_SECONDS must be a positive integer.',
      );
    }

    return parsedValue;
  }
}
