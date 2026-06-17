import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly isBypass: boolean;

  constructor(private configService: ConfigService) {
    this.isBypass = this.configService.get<string>('SMS_BYPASS') === 'true';
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
    // Implement Alpha SMS API call here
    this.logger.log(`Sending via Alpha SMS to ${phone}`);
  }

  private async sendItalianSms(phone: string, otp: string) {
    // Implement Italian SMS API call here
    this.logger.log(`Sending via Italian SMS to ${phone}`);
  }
}
