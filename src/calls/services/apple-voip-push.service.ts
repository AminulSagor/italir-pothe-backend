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
    const uniqueTokens = [
      ...new Set(tokens.map((token) => token.trim())),
    ].filter(Boolean);

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

    const primaryEndpoint = configuration.useSandbox
      ? 'https://api.sandbox.push.apple.com'
      : 'https://api.push.apple.com';
    const fallbackEndpoint = configuration.useSandbox
      ? 'https://api.push.apple.com'
      : 'https://api.sandbox.push.apple.com';

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
        audioSessionMode:
          call.callType === CallType.VIDEO ? 'videoChat' : 'voiceChat',
        audioSessionActive: true,
        ringtonePath: 'system_ringtone_default',
      },
    });

    const topic = `${configuration.bundleId}.voip`;
    const primaryResults = await this.sendBatch({
      callId: call.callId,
      endpoint: primaryEndpoint,
      tokens: uniqueTokens,
      payload,
      authorization,
      topic,
    });
    const environmentMismatchTokens = primaryResults
      .filter((result) => result.reason === 'BadDeviceToken')
      .map((result) => result.token);

    if (environmentMismatchTokens.length === 0) {
      return primaryResults;
    }

    this.logger.warn(
      `Retrying ${environmentMismatchTokens.length} VoIP push(es) against the opposite APNs environment`,
    );

    const fallbackResults = await this.sendBatch({
      callId: call.callId,
      endpoint: fallbackEndpoint,
      tokens: environmentMismatchTokens,
      payload,
      authorization,
      topic,
    });
    const fallbackByToken = new Map(
      fallbackResults.map((result) => [result.token, result]),
    );

    return primaryResults.map(
      (result) => fallbackByToken.get(result.token) ?? result,
    );
  }

  private async sendBatch(params: {
    callId: string;
    endpoint: string;
    tokens: string[];
    payload: string;
    authorization: string;
    topic: string;
  }): Promise<AppleVoipPushResult[]> {
    const client = connect(params.endpoint);

    client.on('error', (error: Error) => {
      this.logger.error(
        `APNs HTTP/2 session failed endpoint=${params.endpoint}: ${error.message}`,
      );
    });

    try {
      const results = await Promise.all(
        params.tokens.map((token) =>
          this.sendRequest({
            client,
            token,
            payload: params.payload,
            authorization: params.authorization,
            topic: params.topic,
          }),
        ),
      );

      this.logger.log('APNs VoIP push batch completed', {
        callId: params.callId,
        environment: params.endpoint.includes('sandbox')
          ? 'sandbox'
          : 'production',
        successCount: results.filter((result) => result.success).length,
        failureReasons: results
          .filter((result) => !result.success)
          .map((result) => result.reason ?? `HTTP_${result.status}`),
        results: results.map((result) => ({
          success: result.success,
          status: result.status,
          reason: result.reason,
        })),
      });
      return results;
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
      request.on('error', (error: Error) => {
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
            const parsed: unknown = JSON.parse(responseBody);
            reason =
              typeof parsed === 'object' &&
              parsed !== null &&
              'reason' in parsed &&
              typeof parsed.reason === 'string'
                ? parsed.reason
                : null;
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
