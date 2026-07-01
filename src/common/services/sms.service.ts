import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface SmsNetResponse<T = unknown> {
  error: number;
  msg: string;
  data?: T;
}

interface SmsNetReportRecipient {
  number: string;
  charge: string;
  status: string;
}

interface SmsNetReportData {
  request_id: number;
  request_status: string;
  request_charge: string;
  recipients: SmsNetReportRecipient[];
}

interface SmsNetBalanceData {
  balance: string;
}

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly isBypass: boolean;
  private readonly smsApiKey?: string;
  private readonly smsSenderId?: string;
  private readonly smsApiBaseUrl = 'https://api.sms.net.bd';

  constructor(private configService: ConfigService) {
    this.isBypass = this.configService.get<string>('SMS_BYPASS')?.trim() === 'true';
    this.smsApiKey = this.configService.get<string>('SMS_API_KEY');
    this.smsSenderId = this.configService.get<string>('SMS_SENDER_ID');
  }

  async sendOtp(phone: string, otp: string): Promise<void> {
    if (this.isBypass) {
      this.logger.log(`[BYPASS MODE] OTP for ${phone} is: ${otp}`);
      return;
    }

    if (phone.startsWith('+39')) {
      await this.sendItalianSms(phone, otp);
    } else {
      await this.sendAlphaSms(phone, otp);
    }
  }

  private async sendAlphaSms(phone: string, otp: string) {
    await this.sendSmsViaSmsNet(phone, otp);
  }

  private async sendItalianSms(phone: string, otp: string) {
    await this.sendSmsViaSmsNet(phone, otp);
  }

  private async sendSmsViaSmsNet(phone: string, otp: string) {
    if (!this.smsApiKey) {
      this.logger.error('SMS API key is not configured. Set SMS_API_KEY in environment.');
      throw new InternalServerErrorException('SMS API key is not configured.');
    }

    const recipient = this.normalizePhoneNumber(phone);
    const url = `${this.smsApiBaseUrl}/sendsms`;
    const body = new URLSearchParams({
      api_key: this.smsApiKey,
      msg: otp,
      to: recipient,
    });

    if (this.smsSenderId) {
      body.append('sender_id', this.smsSenderId);
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    const result = (await response.json()) as SmsNetResponse<{ request_id: number }>;

    if (response.ok && result.error === 0) {
      this.logger.log(`SMS request submitted for ${recipient}. request_id=${result.data?.request_id}`);
      return;
    }

    const errorMessage = result?.msg || `SMS provider returned status ${response.status}`;
    this.logger.error(`SMS send failed for ${recipient}: ${errorMessage}`);
    throw new InternalServerErrorException(`SMS send failed: ${errorMessage}`);
  }

  async getRequestReport(requestId: number | string) {
    if (!this.smsApiKey) {
      throw new InternalServerErrorException('SMS API key is not configured.');
    }

    const url = new URL(`${this.smsApiBaseUrl}/report/request/${requestId}/`);
    url.searchParams.append('api_key', this.smsApiKey);

    const response = await fetch(url.toString());
    const result = (await response.json()) as SmsNetResponse<SmsNetReportData>;

    if (response.ok && result.error === 0) {
      return result.data;
    }

    const errorMessage = result?.msg || `SMS provider returned status ${response.status}`;
    this.logger.error(`SMS report fetch failed for request_id=${requestId}: ${errorMessage}`);
    throw new InternalServerErrorException(`SMS report fetch failed: ${errorMessage}`);
  }

  async getBalance() {
    if (!this.smsApiKey) {
      throw new InternalServerErrorException('SMS API key is not configured.');
    }

    const url = new URL(`${this.smsApiBaseUrl}/user/balance/`);
    url.searchParams.append('api_key', this.smsApiKey);

    const response = await fetch(url.toString());
    const result = (await response.json()) as SmsNetResponse<SmsNetBalanceData>;

    if (response.ok && result.error === 0) {
      return result.data;
    }

    const errorMessage = result?.msg || `SMS provider returned status ${response.status}`;
    this.logger.error(`SMS balance fetch failed: ${errorMessage}`);
    throw new InternalServerErrorException(`SMS balance fetch failed: ${errorMessage}`);
  }

  private normalizePhoneNumber(phone: string): string {
    let normalized = phone.trim();

    if (normalized.startsWith('+')) {
      normalized = normalized.slice(1);
    }

    if (normalized.startsWith('00')) {
      normalized = normalized.slice(2);
    }

    return normalized;
  }
}
