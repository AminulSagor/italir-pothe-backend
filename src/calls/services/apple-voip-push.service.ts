import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createPrivateKey, sign } from 'node:crypto';
import { connect } from 'node:http2';

import { CallType } from '../enums/call.enums';

export interface AppleVoipPushResult {
  token: string;
  success: boolean;
  status: number;
  reason: string | null;
}

interface IncomingCallPush {
  callId: string;
  conversationId: string;
  callType: CallType;
  callerId: string;
  callerName: string;
  callerAvatarUrl: string;
}

@Injectable()
export class AppleVoipPushService {
  private readonly logger = new Logger(AppleVoipPushService.name);
  private cachedJwt: { value: string; issuedAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  async sendIncomingCall(
    tokens: string[],
    call: IncomingCallPush,
  ): Promise<AppleVoipPushResult[]> {
    const uniqueTokens = [...new Set(tokens.map((token) => token.trim()))].filter(
      Boolean,
    );

    if (uniqueTokens.length === 0) {
      return [];
    }

    const configuration = this.getConfiguration();
    if (!configuration) {
      this.logger.error(
        'APNs VoIP push is not configured; incoming iOS calls cannot wake terminated apps',
      );
      return uniqueTokens.map((token) => ({
        token,
        success: false,
        status: 0,
        reason: 'APNS_NOT_CONFIGURED',
      }));
    }

    let authorization: string;
    try {
      authorization = `bearer ${this.getProviderToken(configuration)}`;
    } catch (error) {
      this.logger.error(
        `Unable to create the APNs provider token: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return uniqueTokens.map((token) => ({
        token,
        success: false,
        status: 0,
        reason: 'APNS_INVALID_CREDENTIALS',
      }));
    }

    const endpoint = configuration.useSandbox
      ? 'https://api.sandbox.push.apple.com'
      : 'https://api.push.apple.com';
    const client = connect(endpoint);

    client.on('error', (error) => {
      this.logger.error(`APNs HTTP/2 session failed: ${error.message}`);
    });

    const payload = JSON.stringify({
      aps: {
        'content-available': 1,
      },
      id: call.callId,
      nameCaller: call.callerName || 'Incoming call',
      appName: 'Italir Pothe',
      handle: call.callerName || 'Italir Pothe',
      type: call.callType === CallType.VIDEO ? 1 : 0,
      duration: 60_000,
      extra: {
        type: 'incoming_call',
        callId: call.callId,
        conversationId: call.conversationId,
        callType: call.callType,
        callerId: call.callerId,
        callerName: call.callerName,
        callerAvatarUrl: call.callerAvatarUrl,
      },
      ios: {
        iconName: 'CallKitLogo',
        handleType: 'generic',
        supportsVideo: call.callType === CallType.VIDEO,
        maximumCallGroups: 1,
        maximumCallsPerCallGroup: 1,
        audioSessionMode: 'default',
        audioSessionActive: true,
        ringtonePath: 'system_ringtone_default',
      },
    });

    try {
      return await Promise.all(
        uniqueTokens.map((token) =>
          this.sendRequest({
            client,
            token,
            payload,
            authorization,
            topic: `${configuration.bundleId}.voip`,
          }),
        ),
      );
    } finally {
      client.close();
    }
  }

  private sendRequest(params: {
    client: ReturnType<typeof connect>;
    token: string;
    payload: string;
    authorization: string;
    topic: string;
  }): Promise<AppleVoipPushResult> {
    return new Promise((resolve) => {
      let status = 0;
      let responseBody = '';
      let completed = false;

      const finish = (result: AppleVoipPushResult) => {
        if (completed) {
          return;
        }
        completed = true;
        resolve(result);
      };

      const request = params.client.request({
        ':method': 'POST',
        ':path': `/3/device/${params.token}`,
        authorization: params.authorization,
        'apns-topic': params.topic,
        'apns-push-type': 'voip',
        'apns-priority': '10',
        'apns-expiration': '0',
        'content-type': 'application/json',
      });

      request.setEncoding('utf8');
      request.setTimeout(10_000, () => {
        request.close();
        finish({
          token: params.token,
          success: false,
          status: 0,
          reason: 'APNS_TIMEOUT',
        });
      });
      request.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      request.on('data', (chunk: string) => {
        responseBody += chunk;
      });
      request.on('error', (error) => {
        finish({
          token: params.token,
          success: false,
          status,
          reason: error.message,
        });
      });
      request.on('end', () => {
        let reason: string | null = null;

        if (responseBody) {
          try {
            const parsed = JSON.parse(responseBody) as { reason?: string };
            reason = parsed.reason ?? null;
          } catch {
            reason = 'APNS_INVALID_RESPONSE';
          }
        }

        finish({
          token: params.token,
          success: status >= 200 && status < 300,
          status,
          reason,
        });
      });
      request.end(params.payload);
    });
  }

  private getProviderToken(configuration: {
    keyId: string;
    teamId: string;
    privateKey: string;
  }): string {
    const now = Math.floor(Date.now() / 1000);
    if (this.cachedJwt && now - this.cachedJwt.issuedAt < 50 * 60) {
      return this.cachedJwt.value;
    }

    const header = this.base64Url(
      JSON.stringify({ alg: 'ES256', kid: configuration.keyId }),
    );
    const claims = this.base64Url(
      JSON.stringify({ iss: configuration.teamId, iat: now }),
    );
    const unsignedToken = `${header}.${claims}`;
    const signature = sign('sha256', Buffer.from(unsignedToken), {
      key: createPrivateKey(configuration.privateKey),
      dsaEncoding: 'ieee-p1363',
    }).toString('base64url');

    const value = `${unsignedToken}.${signature}`;
    this.cachedJwt = { value, issuedAt: now };
    return value;
  }

  private base64Url(value: string): string {
    return Buffer.from(value).toString('base64url');
  }

  private getConfiguration(): {
    keyId: string;
    teamId: string;
    privateKey: string;
    bundleId: string;
    useSandbox: boolean;
  } | null {
    const keyId = this.configService.get<string>('APPLE_APNS_KEY_ID')?.trim();
    const teamId = this.configService.get<string>('APPLE_APNS_TEAM_ID')?.trim();
    const rawPrivateKey = this.configService
      .get<string>('APPLE_APNS_PRIVATE_KEY')
      ?.trim();
    const bundleId =
      this.configService.get<string>('APPLE_APNS_BUNDLE_ID')?.trim() ||
      this.configService.get<string>('APP_STORE_BUNDLE_ID')?.trim();

    if (!keyId || !teamId || !rawPrivateKey || !bundleId) {
      return null;
    }

    return {
      keyId,
      teamId,
      privateKey: rawPrivateKey.replace(/\\n/g, '\n'),
      bundleId,
      useSandbox:
        this.configService.get<string>('APPLE_APNS_USE_SANDBOX') === 'true',
    };
  }
}
