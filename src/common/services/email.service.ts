import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { Transporter } from 'nodemailer';

import { OtpPurpose } from '../../users/entities/otp.entity';

@Injectable()
export class EmailService {
  private readonly transporter: Transporter | null;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('ZOHO_SMTP_HOST');
    const port = Number(this.configService.get<string>('ZOHO_SMTP_PORT') ?? '587');
    const secure = this.configService.get<string>('ZOHO_SMTP_SECURE') === 'true';
    const user = this.configService.get<string>('ZOHO_SMTP_USER');
    const pass = this.configService.get<string>('ZOHO_SMTP_PASS');

    this.transporter =
      host && user && pass
        ? nodemailer.createTransport({
            host,
            port: Number.isFinite(port) ? port : 587,
            secure,
            auth: {
              user,
              pass,
            },
          })
        : null;
  }

  async sendOtpEmail(
    email: string,
    otp: string,
    purpose: OtpPurpose = OtpPurpose.ACCOUNT_VERIFICATION,
  ): Promise<void> {
    if (this.configService.get<string>('EMAIL_BYPASS') === 'true') {
      this.logger.log(`[BYPASS MODE] Email OTP for ${email} is: ${otp}`);
      return;
    }

    const fromEmail =
      this.configService.get<string>('ZOHO_FROM_EMAIL') ??
      this.configService.get<string>('SES_FROM_EMAIL');

    if (!fromEmail) {
      throw new ServiceUnavailableException(
        'Zoho Mail sender address is not configured',
      );
    }

    if (!this.transporter) {
      throw new ServiceUnavailableException('Zoho Mail SMTP is not configured');
    }

    const isPasswordReset = purpose === OtpPurpose.PASSWORD_RESET;

    const subject = isPasswordReset
      ? 'Reset your Italir Pothe password'
      : 'Verify your Italir Pothe account';

    const textBody = isPasswordReset
      ? `Your Italir Pothe password reset code is: ${otp}. This code will expire in 10 minutes.`
      : `Your Italir Pothe verification code is: ${otp}. This code will expire in 10 minutes.`;

    try {
      await this.transporter.sendMail({
        from: fromEmail,
        to: email,
        subject,
        text: textBody,
        html: `<p>${textBody}</p><p>If you did not request this code, you can ignore this email.</p>`,
      });
    } catch (error) {
      this.logger.error('Failed to send OTP email', error);
      throw new ServiceUnavailableException(
        'Could not send verification email. Please try again later.',
      );
    }
  }
}
