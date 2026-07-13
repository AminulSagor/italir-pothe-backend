import { Injectable } from '@nestjs/common';

import { EmailService } from '../common/services/email.service';
import { CreateContactEnquiryDto } from './dto/create-contact-enquiry.dto';

export interface ContactEnquiryResponse {
  message: string;
}

@Injectable()
export class ContactService {
  constructor(private readonly emailService: EmailService) {}

  async submitEnquiry(
    dto: CreateContactEnquiryDto,
  ): Promise<ContactEnquiryResponse> {
    /*
     * Bots commonly fill hidden fields.
     * Return a normal response without sending an email.
     */
    if (dto.website?.trim()) {
      return {
        message: 'Your enquiry has been sent successfully.',
      };
    }

    await this.emailService.sendContactEnquiry({
      name: dto.name,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
    });

    return {
      message:
        'Your enquiry has been sent successfully. Our team will respond as soon as possible.',
    };
  }
}
