import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OtpPurpose } from '../users/entities/otp.entity';

@Injectable()
export class EmailService {
  private readonly sesClient: SESClient;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    const accessKeyId =
      this.configService.get<string>('AWS_ACCESS_KEY_ID') ??
      this.configService.get<string>('AWS_SES_ACCESS_KEY');

    const secretAccessKey =
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ??
      this.configService.get<string>('AWS_SES_SECRET_KEY');

    this.sesClient = new SESClient({
      region:
        this.configService.get<string>('AWS_SES_REGION') ?? 'eu-central-1',
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
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

    const fromEmail = this.configService.get<string>('SES_FROM_EMAIL');

    if (!fromEmail) {
      throw new ServiceUnavailableException('SES_FROM_EMAIL is not configured');
    }

    const isPasswordReset = purpose === OtpPurpose.PASSWORD_RESET;

    const subject = isPasswordReset
      ? 'Reset your Italir Pothe password'
      : 'Verify your Italir Pothe account';

    const textBody = isPasswordReset
      ? `Your Italir Pothe password reset code is: ${otp}. This code will expire in 10 minutes.`
      : `Your Italir Pothe verification code is: ${otp}. This code will expire in 10 minutes.`;

    const command = new SendEmailCommand({
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Body: {
          Text: {
            Data: textBody,
            Charset: 'UTF-8',
          },
          Html: {
            Data: `<p>${textBody}</p><p>If you did not request this code, you can ignore this email.</p>`,
            Charset: 'UTF-8',
          },
        },
        Subject: {
          Data: subject,
          Charset: 'UTF-8',
        },
      },
      Source: fromEmail,
    });

    try {
      await this.sesClient.send(command);
    } catch (error) {
      this.logger.error('Failed to send OTP email', error);
      throw new ServiceUnavailableException(
        'Could not send verification email. Please try again later.',
      );
    }
  }
}
