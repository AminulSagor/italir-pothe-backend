import { PDFDocument } from 'pdf-lib';

import { CertificateGenerationService } from './certificate-generation.service';

describe('CertificateGenerationService', () => {
  const service = new CertificateGenerationService();

  const basePayload = {
    certificateNumber: 'IP-2026-000001',
    recipientName: 'Fahid Hasan',
    issuedAt: new Date('2026-09-21T00:00:00.000Z'),
    verificationUrl:
      'https://italirpothe.com/certificates/public/verify/test-certificate',
  };

  it('generates a certificate PDF with a Bengali course title', async () => {
    const pdf = await service.generatePdf({
      ...basePayload,
      recipientName: 'ফাহিদ হাসান',
      courseTitle: 'ইতালিয়ান ভাষা সহজ পাঠ',
    });

    const document = await PDFDocument.load(pdf);

    expect(document.getPageCount()).toBe(1);
  });

  it('continues to generate an English certificate PDF', async () => {
    const pdf = await service.generatePdf({
      ...basePayload,
      courseTitle: 'Italian Language Made Easy',
    });

    const document = await PDFDocument.load(pdf);

    expect(document.getPageCount()).toBe(1);
  });
});
