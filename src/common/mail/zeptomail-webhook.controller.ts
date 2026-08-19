import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';
import type { Request } from 'express';

import { EmailSuppressionReason } from './entities/email-suppression.entity';
import { EmailSuppressionService } from './email-suppression.service';

@Controller('webhooks/zeptomail')
export class ZeptoMailWebhookController {
  constructor(
    private readonly configService: ConfigService,
    private readonly suppressionService: EmailSuppressionService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('producer-signature') producerSignature: string | undefined,
    @Body() body: unknown,
  ) {
    const payload = this.validateAndParsePayload(
      request.rawBody,
      body,
      producerSignature,
    );
    const eventName = this.firstString(payload.event_name)
      .toLowerCase()
      .replace(/[^a-z]/g, '');

    if (!['hardbounce', 'feedbackloop'].includes(eventName)) {
      return { received: true, suppressed: false };
    }

    const messages = Array.isArray(payload.event_message)
      ? payload.event_message
      : [];
    const eventId = this.firstString(payload.webhook_request_id) || undefined;
    let suppressed = 0;

    for (const message of messages) {
      if (!this.isRecord(message)) {
        continue;
      }

      const recipients = this.extractRecipients(message, eventName);
      const details = this.extractDetails(message);
      const emailInfo = this.isRecord(message.email_info)
        ? message.email_info
        : {};
      const correlationId =
        this.firstString(emailInfo.client_reference) || undefined;

      for (const email of recipients) {
        await this.suppressionService.suppress({
          email,
          reason:
            eventName === 'feedbackloop'
              ? EmailSuppressionReason.COMPLAINT
              : EmailSuppressionReason.HARD_BOUNCE,
          sourceEventId: eventId || this.firstString(message.request_id),
          correlationId,
          details,
        });
        suppressed += 1;
      }
    }

    return { received: true, suppressed };
  }

  private validateAndParsePayload(
    rawBody: Buffer | undefined,
    body: unknown,
    producerSignature?: string,
  ): Record<string, unknown> {
    const secret = this.configService
      .get<string>('ZEPTOMAIL_WEBHOOK_SECRET')
      ?.trim();

    if (!secret) {
      throw new ServiceUnavailableException(
        'ZeptoMail webhook secret is not configured',
      );
    }

    if (!rawBody?.length || !producerSignature) {
      throw new UnauthorizedException('Invalid ZeptoMail webhook signature');
    }

    const signatureParts = Object.fromEntries(
      producerSignature.split(';').map((part) => {
        const separator = part.indexOf('=');
        return separator === -1
          ? [part, '']
          : [part.slice(0, separator), part.slice(separator + 1)];
      }),
    );
    const timestamp = Number(signatureParts.ts);
    const algorithm = signatureParts['s-algorithm'];

    if (
      !Number.isFinite(timestamp) ||
      algorithm?.toLowerCase() !== 'hmacsha256' ||
      Math.abs(Date.now() - timestamp) > 5 * 60 * 1000
    ) {
      throw new UnauthorizedException('Invalid ZeptoMail webhook signature');
    }

    const rawText = rawBody.toString('utf8');
    let decodedBody: string;
    try {
      decodedBody = decodeURIComponent(rawText.replace(/\+/g, ' '));
    } catch {
      throw new UnauthorizedException('Invalid ZeptoMail webhook signature');
    }
    const signedData = decodedBody.startsWith('data=')
      ? decodedBody.slice('data='.length)
      : rawText;
    const expected = createHmac('sha256', secret)
      .update(signedData)
      .digest();

    let received: Buffer;
    try {
      received = Buffer.from(
        decodeURIComponent(signatureParts.s || ''),
        'base64',
      );
    } catch {
      throw new UnauthorizedException('Invalid ZeptoMail webhook signature');
    }

    if (
      received.length !== expected.length ||
      !timingSafeEqual(received, expected)
    ) {
      throw new UnauthorizedException('Invalid ZeptoMail webhook signature');
    }

    const candidate =
      this.isRecord(body) && 'data' in body ? body.data : body;
    if (this.isRecord(candidate)) {
      return candidate;
    }

    if (typeof candidate === 'string') {
      try {
        const parsed: unknown = JSON.parse(candidate);
        if (this.isRecord(parsed)) {
          return parsed;
        }
      } catch {
        throw new BadRequestException('Invalid ZeptoMail webhook payload');
      }
    }

    throw new BadRequestException('Invalid ZeptoMail webhook payload');
  }

  private extractRecipients(
    message: Record<string, unknown>,
    eventName: string,
  ): string[] {
    const eventData = Array.isArray(message.event_data)
      ? message.event_data
      : [];
    const bouncedRecipients = eventData.flatMap((item) => {
      if (!this.isRecord(item) || !Array.isArray(item.details)) {
        return [];
      }
      return item.details.flatMap((detail) => {
        if (!this.isRecord(detail)) {
          return [];
        }
        const value = this.firstString(
          eventName === 'feedbackloop' ? detail.to : detail.bounced_recipient,
        );
        return this.isEmail(value) ? [value.toLowerCase()] : [];
      });
    });

    if (bouncedRecipients.length) {
      return [...new Set(bouncedRecipients)];
    }

    const emailInfo = this.isRecord(message.email_info)
      ? message.email_info
      : {};
    const to = Array.isArray(emailInfo.to) ? emailInfo.to : [];
    const fallbackRecipients = [
      ...new Set(
        to.flatMap((recipient) => {
          if (!this.isRecord(recipient)) {
            return [];
          }
          const addressContainer = this.isRecord(recipient.email_address)
            ? recipient.email_address
            : recipient;
          const address = this.firstString(addressContainer.address);
          return this.isEmail(address) ? [address.toLowerCase()] : [];
        }),
      ),
    ];

    // Never suppress every recipient of a multi-recipient message by inference.
    return fallbackRecipients.length === 1 ? fallbackRecipients : [];
  }

  private extractDetails(message: Record<string, unknown>): string | undefined {
    const eventData = Array.isArray(message.event_data)
      ? message.event_data
      : [];
    const first = eventData.find((item) => this.isRecord(item));
    if (!this.isRecord(first) || !Array.isArray(first.details)) {
      return undefined;
    }
    const detail = first.details.find((item) => this.isRecord(item));
    if (!this.isRecord(detail)) {
      return undefined;
    }
    return (
      this.firstString(detail.diagnostic_message) ||
      this.firstString(detail.reason) ||
      undefined
    );
  }

  private firstString(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === 'string');
      return typeof first === 'string' ? first : '';
    }
    return '';
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }
}
