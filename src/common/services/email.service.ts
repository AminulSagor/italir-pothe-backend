import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

import { OtpPurpose } from '../../users/entities/otp.entity';

export interface ContactEnquiryEmailPayload {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

@Injectable()
export class EmailService {
  private readonly transporter: Transporter | null;
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('ZOHO_SMTP_HOST')?.trim();

    const port = Number(
      this.configService.get<string>('ZOHO_SMTP_PORT') ?? '587',
    );

    const secure =
      this.configService.get<string>('ZOHO_SMTP_SECURE') === 'true';

    const user = this.configService.get<string>('ZOHO_SMTP_USER')?.trim();

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

    const transporter = this.getTransporter();
    const fromEmail = this.getFromEmail();
    const fromName = this.getFromName();

    const isPasswordReset = purpose === OtpPurpose.PASSWORD_RESET;

    const subject = isPasswordReset
      ? 'Reset your Italir Pothe password'
      : 'Verify your Italir Pothe account';

    const textBody = isPasswordReset
      ? `Your Italir Pothe password reset code is: ${otp}. This code will expire in 10 minutes.`
      : `Your Italir Pothe verification code is: ${otp}. This code will expire in 10 minutes.`;

    try {
      await transporter.sendMail({
        from: {
          name: fromName,
          address: fromEmail,
        },
        to: email,
        subject,
        text: textBody,
        html: `
          <p>${this.escapeHtml(textBody)}</p>
          <p>If you did not request this code, you can ignore this email.</p>
        `,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send OTP email',
        error instanceof Error ? error.stack : undefined,
      );

      throw new ServiceUnavailableException(
        'Could not send verification email. Please try again later.',
      );
    }
  }

  async sendContactEnquiry(payload: ContactEnquiryEmailPayload): Promise<void> {
    const transporter = this.getTransporter();
    const fromEmail = this.getFromEmail();
    const fromName = this.getFromName();

    const destinationEmail =
      this.configService.get<string>('CONTACT_INBOX_EMAIL')?.trim() ||
      fromEmail;

    const visitorName = this.sanitizeHeaderValue(payload.name);
    const visitorEmail = payload.email.trim().toLowerCase();

    const enquirySubject =
      this.sanitizeHeaderValue(payload.subject || '') || 'Website enquiry';

    const message = payload.message.trim();
    const submittedAt = new Date().toISOString();

    const textBody = [
      'New Italir Pothe website enquiry',
      '',
      `Name: ${visitorName}`,
      `Email: ${visitorEmail}`,
      `Subject: ${enquirySubject}`,
      `Submitted at: ${submittedAt}`,
      '',
      'Message:',
      message,
    ].join('\n');

    const htmlBody = `
      <div style="font-family:Arial,Helvetica,sans-serif;color:#17211d;line-height:1.6">
        <h2 style="color:#006b3f">New website enquiry</h2>

        <table
          cellpadding="8"
          cellspacing="0"
          style="width:100%;max-width:640px;border-collapse:collapse"
        >
          <tr>
            <td style="font-weight:700;border-bottom:1px solid #e2e7e3">
              Name
            </td>
            <td style="border-bottom:1px solid #e2e7e3">
              ${this.escapeHtml(visitorName)}
            </td>
          </tr>

          <tr>
            <td style="font-weight:700;border-bottom:1px solid #e2e7e3">
              Email
            </td>
            <td style="border-bottom:1px solid #e2e7e3">
              ${this.escapeHtml(visitorEmail)}
            </td>
          </tr>

          <tr>
            <td style="font-weight:700;border-bottom:1px solid #e2e7e3">
              Subject
            </td>
            <td style="border-bottom:1px solid #e2e7e3">
              ${this.escapeHtml(enquirySubject)}
            </td>
          </tr>

          <tr>
            <td style="font-weight:700;border-bottom:1px solid #e2e7e3">
              Submitted
            </td>
            <td style="border-bottom:1px solid #e2e7e3">
              ${this.escapeHtml(submittedAt)}
            </td>
          </tr>
        </table>

        <h3 style="margin-top:24px">Message</h3>

        <div
          style="max-width:640px;padding:18px;background:#f4faf5;border-radius:14px;white-space:pre-wrap"
        >${this.escapeHtml(message)}</div>

        <p style="margin-top:24px;color:#657069">
          Reply to this email to respond directly to ${this.escapeHtml(
            visitorName,
          )}.
        </p>
      </div>
    `;

    try {
      await transporter.sendMail({
        from: {
          name: fromName,
          address: fromEmail,
        },

        to: destinationEmail,

        replyTo: {
          name: visitorName,
          address: visitorEmail,
        },

        subject: `[Website enquiry] ${enquirySubject}`,
        text: textBody,
        html: htmlBody,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send website contact enquiry',
        error instanceof Error ? error.stack : undefined,
      );

      throw new ServiceUnavailableException(
        'Could not send your enquiry. Please try again later.',
      );
    }
  }

  private getTransporter(): Transporter {
    if (!this.transporter) {
      throw new ServiceUnavailableException('Zoho Mail SMTP is not configured');
    }

    return this.transporter;
  }

  private getFromEmail(): string {
    const fromEmail =
      this.configService.get<string>('ZOHO_FROM_EMAIL')?.trim() ||
      this.configService.get<string>('ZOHO_SMTP_USER')?.trim();

    if (!fromEmail) {
      throw new ServiceUnavailableException(
        'Zoho Mail sender address is not configured',
      );
    }

    return fromEmail;
  }

  private getFromName(): string {
    return (
      this.configService.get<string>('ZOHO_FROM_NAME')?.trim() || 'Italir Pothe'
    );
  }

  private sanitizeHeaderValue(value: string): string {
    return value.trim().replace(/[\r\n]+/g, ' ');
  }

  private escapeHtml(value: string): string {
    return value.replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#039;',
        })[character] ?? character,
    );
  }
}
