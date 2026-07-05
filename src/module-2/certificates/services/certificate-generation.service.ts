import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { existsSync } from 'fs';
import { readFile } from 'fs/promises';
import { join } from 'path';
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
    const [logoBuffer, signatureBuffer, qrBuffer] = await Promise.all([
      this.readAsset('italir_pothe_logo.png'),

      this.readAsset('certificate_signature.png'),

      QRCode.toBuffer(payload.verificationUrl, {
        type: 'png',
        width: 220,
        margin: 1,

        color: {
          dark: '#005A34',
          light: '#FFFFFF',
        },
      }),
    ]);

    const document = await PDFDocument.create();

    const page = document.addPage([841.89, 595.28]);

    const [regularFont, boldFont] = await Promise.all([
      document.embedFont(StandardFonts.Helvetica),

      document.embedFont(StandardFonts.HelveticaBold),
    ]);

    const [logo, signature, qrCode] = await Promise.all([
      document.embedPng(logoBuffer),

      document.embedPng(signatureBuffer),

      document.embedPng(qrBuffer),
    ]);

    const green = rgb(0 / 255, 90 / 255, 52 / 255);

    const brightGreen = rgb(93 / 255, 247 / 255, 79 / 255);

    const dark = rgb(35 / 255, 42 / 255, 38 / 255);

    const muted = rgb(100 / 255, 108 / 255, 102 / 255);

    const pale = rgb(243 / 255, 248 / 255, 241 / 255);

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

    page.drawImage(logo, {
      x: 68,
      y: 451,
      width: 76,
      height: 76,
    });

    page.drawText('Italir Pothe', {
      x: 156,
      y: 490,
      size: 25,
      font: boldFont,
      color: dark,
    });

    page.drawText('Unlock Your Italian Career Path', {
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
      'CERTIFICATE OF COMPLETION',
      regularFont,
      18,
      muted,
      80,
      405,
      681,
    );

    this.drawCenteredText(
      page,
      payload.recipientName,
      boldFont,
      this.fitFontSize(payload.recipientName, 32, 22, 560),
      green,
      80,
      355,
      681,
    );

    page.drawLine({
      start: {
        x: 322,
        y: 336,
      },
      end: {
        x: 520,
        y: 336,
      },
      thickness: 2,
      color: brightGreen,
    });

    this.drawCenteredText(
      page,
      'has successfully attained the proficiency level of',
      regularFont,
      12,
      muted,
      80,
      309,
      681,
    );

    const levelText = payload.courseLevel
      ? `Level ${payload.courseLevel}`
      : 'Course Completion';

    this.drawCenteredText(page, levelText, boldFont, 27, green, 80, 271, 681);

    this.drawCenteredText(
      page,
      payload.courseTitle,
      boldFont,
      this.fitFontSize(payload.courseTitle, 16, 11, 540),
      dark,
      120,
      232,
      601,
    );

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
      11,
      muted,
      120,
      207,
      601,
    );

    if (payload.scorePercent !== null) {
      this.drawCenteredText(
        page,
        `Final score: ${payload.scorePercent.toFixed(2)}%`,
        regularFont,
        10,
        muted,
        120,
        187,
        601,
      );
    }

    const signatureWidth = 140;

    const signatureHeight =
      signature.height * (signatureWidth / signature.width);

    page.drawImage(signature, {
      x: 100,
      y: 78,
      width: signatureWidth,
      height: signatureHeight,
    });

    page.drawLine({
      start: {
        x: 88,
        y: 75,
      },
      end: {
        x: 255,
        y: 75,
      },
      thickness: 0.8,
      color: muted,
    });

    page.drawText('REGISTRAR SIGNATURE', {
      x: 109,
      y: 58,
      size: 8,
      font: regularFont,
      color: muted,
    });

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

    page.drawText(`Certificate ID: ${payload.certificateNumber}`, {
      x: 300,
      y: 90,
      size: 10,
      font: regularFont,
      color: dark,
    });

    page.drawText(payload.verificationUrl, {
      x: 300,
      y: 70,
      size: 6.5,
      font: regularFont,
      color: muted,
      maxWidth: 330,
    });

    const bytes = await document.save({
      useObjectStreams: false,
    });

    return Buffer.from(bytes);
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

  private async readAsset(fileName: string): Promise<Buffer> {
    const candidates = [
      join(process.cwd(), 'assets', 'certificates', fileName),

      join(
        process.cwd(),
        'src',
        'module-2',
        'certificates',
        'assets',
        fileName,
      ),

      join(__dirname, '..', 'assets', fileName),
    ];

    const assetPath = candidates.find((candidate) => existsSync(candidate));

    if (!assetPath) {
      throw new InternalServerErrorException(
        `Certificate asset is missing: ${fileName}`,
      );
    }

    return readFile(assetPath);
  }
}
