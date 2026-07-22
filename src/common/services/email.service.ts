import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OtpPurpose } from '../../users/entities/otp.entity';

export interface ContactEnquiryEmailPayload {
  name: string;
  email: string;
  subject?: string;
  message: string;
}

interface ZeptoMailAddress {
  address: string;
  name?: string;
}

interface ZeptoMailRecipient {
  email_address: ZeptoMailAddress;
}

interface ZeptoMailSendPayload {
  from: ZeptoMailAddress;
  to: ZeptoMailRecipient[];
  reply_to?: ZeptoMailAddress[];
  subject: string;
  htmlbody: string;
  track_clicks?: boolean;
  track_opens?: boolean;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendOtpEmail(
    email: string,
    otp: string,
    purpose: OtpPurpose = OtpPurpose.ACCOUNT_VERIFICATION,
  ): Promise<void> {
    if (this.configService.get<string>('EMAIL_BYPASS') === 'true') {
      this.logger.log(`[BYPASS MODE] Email OTP for ${email} is: ${otp}`);

      return;
    }

    const fromEmail = this.getFromEmail();
    const fromName = this.getFromName();
    const recipientEmail = email.trim().toLowerCase();

    let subject: string;
    let instruction: string;
    let securityMessage: string;

    switch (purpose) {
      case OtpPurpose.PASSWORD_RESET:
        subject = 'Reset your Italir Pothe password';

        instruction =
          'Use the following code to reset your Italir Pothe password:';

        securityMessage =
          'If you did not request a password reset, you can safely ignore this email.';

        break;

      case OtpPurpose.ACCOUNT_DELETION:
        subject = 'Confirm your Italir Pothe account deletion';

        instruction =
          'Use the following code to permanently delete your Italir Pothe account:';

        securityMessage =
          'If you did not request account deletion, do not share this code and safely ignore this email.';

        break;

      case OtpPurpose.ACCOUNT_VERIFICATION:
      default:
        subject = 'Verify your Italir Pothe account';

        instruction =
          'Use the following code to verify your Italir Pothe account:';

        securityMessage =
          'If you did not request this verification code, you can safely ignore this email.';

        break;
    }

    const htmlBody = `
    <div
      style="
        max-width:600px;
        margin:0 auto;
        padding:24px;
        font-family:Arial,Helvetica,sans-serif;
        color:#17211d;
        line-height:1.6;
      "
    >
      <h2
        style="
          color:#006b3f;
          margin-bottom:16px;
        "
      >
        ${this.escapeHtml(subject)}
      </h2>

      <p>Hello,</p>

      <p>
        ${this.escapeHtml(instruction)}
      </p>

      <div
        style="
          margin:24px 0;
          padding:18px;
          border-radius:12px;
          background:#f0faf4;
          color:#006b3f;
          font-size:32px;
          font-weight:700;
          letter-spacing:8px;
          text-align:center;
        "
      >
        ${this.escapeHtml(otp)}
      </div>

      <p>
        This code will expire in 10 minutes.
      </p>

      ${
        purpose === OtpPurpose.ACCOUNT_DELETION
          ? `
            <p
              style="
                padding:14px;
                border-radius:10px;
                background:#fff1f2;
                color:#b42318;
                font-weight:600;
              "
            >
              Account deletion is permanent and cannot be undone.
            </p>
          `
          : ''
      }

      <p style="color:#657069">
        ${this.escapeHtml(securityMessage)}
      </p>

      <p>
        Regards,<br />
        <strong>Italir Pothe</strong>
      </p>
    </div>
  `;

    try {
      await this.sendEmail({
        from: {
          address: fromEmail,
          name: fromName,
        },

        to: [
          {
            email_address: {
              address: recipientEmail,
            },
          },
        ],

        subject,
        htmlbody: htmlBody,
        track_clicks: false,
        track_opens: false,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send OTP email using ZeptoMail API',
        error instanceof Error ? error.stack : undefined,
      );

      throw new ServiceUnavailableException(
        'Could not send verification email. Please try again later.',
      );
    }
  }

  async sendContactEnquiry(payload: ContactEnquiryEmailPayload): Promise<void> {
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

    const htmlBody = `
      <div
        style="
          font-family:Arial,Helvetica,sans-serif;
          color:#17211d;
          line-height:1.6;
        "
      >
        <h2 style="color:#006b3f">
          New website enquiry
        </h2>

        <table
          cellpadding="8"
          cellspacing="0"
          style="
            width:100%;
            max-width:640px;
            border-collapse:collapse;
          "
        >
          <tr>
            <td
              style="
                font-weight:700;
                border-bottom:1px solid #e2e7e3;
              "
            >
              Name
            </td>

            <td style="border-bottom:1px solid #e2e7e3">
              ${this.escapeHtml(visitorName)}
            </td>
          </tr>

          <tr>
            <td
              style="
                font-weight:700;
                border-bottom:1px solid #e2e7e3;
              "
            >
              Email
            </td>

            <td style="border-bottom:1px solid #e2e7e3">
              ${this.escapeHtml(visitorEmail)}
            </td>
          </tr>

          <tr>
            <td
              style="
                font-weight:700;
                border-bottom:1px solid #e2e7e3;
              "
            >
              Subject
            </td>

            <td style="border-bottom:1px solid #e2e7e3">
              ${this.escapeHtml(enquirySubject)}
            </td>
          </tr>

          <tr>
            <td
              style="
                font-weight:700;
                border-bottom:1px solid #e2e7e3;
              "
            >
              Submitted
            </td>

            <td style="border-bottom:1px solid #e2e7e3">
              ${this.escapeHtml(submittedAt)}
            </td>
          </tr>
        </table>

        <h3 style="margin-top:24px">
          Message
        </h3>

        <div
          style="
            max-width:640px;
            padding:18px;
            background:#f4faf5;
            border-radius:14px;
            white-space:pre-wrap;
          "
        >${this.escapeHtml(message)}</div>

        <p style="margin-top:24px;color:#657069">
          Reply to this email to respond directly to
          ${this.escapeHtml(visitorName)}.
        </p>
      </div>
    `;

    try {
      await this.sendEmail({
        from: {
          address: fromEmail,
          name: fromName,
        },

        to: [
          {
            email_address: {
              address: destinationEmail,
              name: 'Italir Pothe Admin',
            },
          },
        ],

        reply_to: [
          {
            address: visitorEmail,
            name: visitorName,
          },
        ],

        subject: `[Website enquiry] ${enquirySubject}`,
        htmlbody: htmlBody,
        track_clicks: false,
        track_opens: false,
      });
    } catch (error) {
      this.logger.error(
        'Failed to send website contact enquiry using ZeptoMail API',
        error instanceof Error ? error.stack : undefined,
      );

      throw new ServiceUnavailableException(
        'Could not send your enquiry. Please try again later.',
      );
    }
  }

  private async sendEmail(payload: ZeptoMailSendPayload): Promise<void> {
    const apiUrl =
      this.configService.get<string>('ZEPTOMAIL_API_URL')?.trim() ||
      'https://api.zeptomail.com/v1.1/email';

    const token = this.configService.get<string>('ZEPTOMAIL_API_TOKEN')?.trim();

    if (!token) {
      throw new ServiceUnavailableException(
        'ZeptoMail API token is not configured',
      );
    }

    const authorizationHeader = this.createAuthorizationHeader(token);

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, 15_000);

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',

        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: authorizationHeader,
        },

        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      const responseBody = await response.text();

      if (!response.ok) {
        const errorMessage = this.extractApiError(responseBody);

        throw new Error(
          `ZeptoMail API request failed with status ${response.status}: ${errorMessage}`,
        );
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private createAuthorizationHeader(token: string): string {
    const normalizedToken = token.trim();

    if (/^zoho-enczapikey\s+/i.test(normalizedToken)) {
      return normalizedToken;
    }

    return `Zoho-enczapikey ${normalizedToken}`;
  }

  private extractApiError(responseBody: string): string {
    if (!responseBody) {
      return 'ZeptoMail returned an empty error response';
    }

    try {
      const parsed: unknown = JSON.parse(responseBody);

      if (!this.isRecord(parsed)) {
        return responseBody.slice(0, 500);
      }

      const error = parsed.error;

      if (this.isRecord(error) && typeof error.message === 'string') {
        return error.message;
      }

      if (typeof parsed.message === 'string') {
        return parsed.message;
      }
    } catch {
      return responseBody.slice(0, 500);
    }

    return responseBody.slice(0, 500);
  }

  private getFromEmail(): string {
    const fromEmail =
      this.configService.get<string>('ZEPTOMAIL_FROM_EMAIL')?.trim() ||
      this.configService.get<string>('ZOHO_FROM_EMAIL')?.trim();

    if (!fromEmail) {
      throw new ServiceUnavailableException(
        'ZeptoMail sender address is not configured',
      );
    }

    return fromEmail;
  }

  private getFromName(): string {
    return (
      this.configService.get<string>('ZEPTOMAIL_FROM_NAME')?.trim() ||
      this.configService.get<string>('ZOHO_FROM_NAME')?.trim() ||
      'Italir Pothe'
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

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
