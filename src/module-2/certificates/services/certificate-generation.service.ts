import { Injectable } from '@nestjs/common';
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';

export interface GenerateCertificatePdfPayload {
  certificateNumber: string;
  recipientName: string;
  courseTitle: string;
  courseLevel: string | null;
  issuedAt: Date;
  verificationUrl: string;
  scorePercent: number | null;
}

@Injectable()
export class CertificateGenerationService {
  async generatePdf(payload: GenerateCertificatePdfPayload): Promise<Buffer> {
    const document = await PDFDocument.create();

    const page = document.addPage([841.89, 595.28]);

    const [regularFont, boldFont, italicFont] = await Promise.all([
      document.embedFont(StandardFonts.Helvetica),
      document.embedFont(StandardFonts.HelveticaBold),
      document.embedFont(StandardFonts.HelveticaOblique),
    ]);

    const qrBuffer = await QRCode.toBuffer(payload.verificationUrl, {
      type: 'png',
      width: 240,
      margin: 1,
      color: {
        dark: '#005A34',
        light: '#FFFFFF',
      },
    });

    const qrCode = await document.embedPng(qrBuffer);

    const green = rgb(0 / 255, 90 / 255, 52 / 255);
    const brightGreen = rgb(93 / 255, 247 / 255, 79 / 255);
    const dark = rgb(35 / 255, 42 / 255, 38 / 255);
    const muted = rgb(100 / 255, 108 / 255, 102 / 255);
    const pale = rgb(243 / 255, 248 / 255, 241 / 255);
    const lightGreen = rgb(232 / 255, 251 / 255, 229 / 255);

    page.drawRectangle({
      x: 22,
      y: 22,
      width: page.getWidth() - 44,
      height: page.getHeight() - 44,
      borderWidth: 2,
      borderColor: green,
      color: rgb(1, 1, 1),
    });

    page.drawRectangle({
      x: 34,
      y: 34,
      width: page.getWidth() - 68,
      height: page.getHeight() - 68,
      borderWidth: 1,
      borderColor: rgb(218 / 255, 227 / 255, 216 / 255),
    });

    this.drawBrandMark(page, boldFont, green, lightGreen);

    page.drawText('Italir Pothe', {
      x: 156,
      y: 490,
      size: 25,
      font: boldFont,
      color: dark,
    });

    page.drawText('Official Italian Language Institute', {
      x: 157,
      y: 468,
      size: 10,
      font: regularFont,
      color: muted,
    });

    page.drawRectangle({
      x: 594,
      y: 484,
      width: 175,
      height: 28,
      color: pale,
      borderColor: brightGreen,
      borderWidth: 1,
    });

    this.drawCenteredText(
      page,
      'VERIFIED AUTHENTIC',
      boldFont,
      10,
      green,
      594,
      493,
      175,
    );

    this.drawCenteredText(
      page,
      'CERTIFICATO DI COMPETENZA',
      boldFont,
      16,
      muted,
      80,
      418,
      681,
    );

    this.drawCenteredText(
      page,
      `ID: ${payload.certificateNumber}`,
      regularFont,
      8,
      muted,
      80,
      400,
      681,
    );

    this.drawCenteredText(
      page,
      'This certificate is proudly presented to',
      italicFont,
      12,
      muted,
      80,
      365,
      681,
    );

    this.drawCenteredText(
      page,
      payload.recipientName,
      boldFont,
      this.fitFontSize(payload.recipientName, 34, 22, 560),
      green,
      80,
      318,
      681,
    );

    page.drawLine({
      start: {
        x: 326,
        y: 300,
      },
      end: {
        x: 516,
        y: 300,
      },
      thickness: 2,
      color: brightGreen,
    });

    this.drawCenteredText(
      page,
      'has successfully completed',
      regularFont,
      12,
      muted,
      80,
      269,
      681,
    );

    this.drawCenteredText(
      page,
      payload.courseTitle,
      boldFont,
      this.fitFontSize(payload.courseTitle, 23, 13, 585),
      green,
      120,
      230,
      601,
    );

    const levelText = payload.courseLevel
      ? `Proficiency Level: ${payload.courseLevel}`
      : 'Final Exam Certification';

    this.drawCenteredText(page, levelText, boldFont, 15, dark, 120, 202, 601);

    if (payload.scorePercent !== null) {
      this.drawCenteredText(
        page,
        `Final Score: ${payload.scorePercent.toFixed(2)}%`,
        regularFont,
        11,
        muted,
        120,
        181,
        601,
      );
    }

    const issueDate = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      timeZone: 'UTC',
    }).format(payload.issuedAt);

    this.drawCenteredText(
      page,
      `Issued on ${issueDate}`,
      regularFont,
      10,
      muted,
      120,
      161,
      601,
    );

    this.drawSignature(page, italicFont, regularFont, green, muted);

    page.drawImage(qrCode, {
      x: 665,
      y: 64,
      width: 92,
      height: 92,
    });

    page.drawText('Scan to verify', {
      x: 681,
      y: 50,
      size: 8,
      font: regularFont,
      color: muted,
    });

    page.drawText(payload.verificationUrl, {
      x: 292,
      y: 64,
      size: 6.5,
      font: regularFont,
      color: muted,
      maxWidth: 340,
    });

    const bytes = await document.save({
      useObjectStreams: false,
    });

    return Buffer.from(bytes);
  }

  private drawBrandMark(
    page: PDFPage,
    boldFont: PDFFont,
    green: ReturnType<typeof rgb>,
    lightGreen: ReturnType<typeof rgb>,
  ): void {
    page.drawCircle({
      x: 105,
      y: 489,
      size: 38,
      color: lightGreen,
      borderColor: green,
      borderWidth: 1.5,
    });

    page.drawText('IP', {
      x: 87,
      y: 477,
      size: 24,
      font: boldFont,
      color: green,
    });
  }

  private drawSignature(
    page: PDFPage,
    italicFont: PDFFont,
    regularFont: PDFFont,
    green: ReturnType<typeof rgb>,
    muted: ReturnType<typeof rgb>,
  ): void {
    page.drawText('Authorized Registrar', {
      x: 82,
      y: 105,
      size: 20,
      font: italicFont,
      color: green,
    });

    page.drawLine({
      start: {
        x: 82,
        y: 87,
      },
      end: {
        x: 262,
        y: 87,
      },
      thickness: 0.8,
      color: muted,
    });

    page.drawText('REGISTRAR SIGNATURE', {
      x: 109,
      y: 70,
      size: 8,
      font: regularFont,
      color: muted,
    });
  }

  private drawCenteredText(
    page: PDFPage,
    text: string,
    font: PDFFont,
    size: number,
    color: ReturnType<typeof rgb>,
    x: number,
    y: number,
    width: number,
  ): void {
    const textWidth = font.widthOfTextAtSize(text, size);

    page.drawText(text, {
      x: x + Math.max(0, (width - textWidth) / 2),
      y,
      size,
      font,
      color,
      maxWidth: width,
    });
  }

  private fitFontSize(
    text: string,
    preferredSize: number,
    minimumSize: number,
    maximumWidth: number,
  ): number {
    const approximateCharacterWidth = 0.56;

    const estimatedWidth =
      text.length * preferredSize * approximateCharacterWidth;

    if (estimatedWidth <= maximumWidth) {
      return preferredSize;
    }

    return Math.max(
      minimumSize,
      Math.floor(maximumWidth / (text.length * approximateCharacterWidth)),
    );
  }
}
