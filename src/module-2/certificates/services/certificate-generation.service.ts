import { Injectable, InternalServerErrorException } from '@nestjs/common';
import {
  degrees,
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  rgb,
  StandardFonts,
} from 'pdf-lib';
import QRCode from 'qrcode';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface GenerateCertificatePdfPayload {
  certificateNumber: string;
  recipientName: string;
  courseTitle: string;
  issuedAt: Date;
  verificationUrl: string;
}

@Injectable()
export class CertificateGenerationService {
  private readonly assetDirectory = join(
    process.cwd(),
    'assets',
    'certificates',
  );

  private readonly logoPath = join(
    this.assetDirectory,
    'italir_pothe_logo.png',
  );

  private readonly awardPath = join(this.assetDirectory, 'award.png');

  private readonly signaturePath = join(
    this.assetDirectory,
    'certificate_signature.png',
  );

  async generatePdf(payload: GenerateCertificatePdfPayload): Promise<Buffer> {
    const document = await PDFDocument.create();

    const page = document.addPage([1123, 794]);

    const fonts = {
      regular: await document.embedFont(StandardFonts.Helvetica),
      bold: await document.embedFont(StandardFonts.HelveticaBold),
      italic: await document.embedFont(StandardFonts.TimesRomanItalic),
      boldItalic: await document.embedFont(StandardFonts.TimesRomanBoldItalic),
    };

    const logo = await this.embedRequiredPng(
      document,
      this.logoPath,
      'italir_pothe_logo.png',
    );

    const award = await this.embedRequiredPng(
      document,
      this.awardPath,
      'award.png',
    );

    const signature = await this.embedRequiredPng(
      document,
      this.signaturePath,
      'certificate_signature.png',
    );

    const qrBuffer = await QRCode.toBuffer(payload.verificationUrl, {
      type: 'png',
      width: 260,
      margin: 1,
      color: {
        dark: '#111111',
        light: '#FFFFFF',
      },
    });

    const qrCode = await document.embedPng(qrBuffer);

    this.drawBackground(page, logo);
    this.drawCertificateFrame(page);
    this.drawCornerShapes(page);
    this.drawHeader(page, fonts, logo, payload.certificateNumber);
    this.drawTitle(page, fonts);
    this.drawRecipient(page, fonts, payload.recipientName);
    this.drawCourseInfo(page, fonts, payload.courseTitle);
    this.drawAwardBadge(page, fonts, award);
    this.drawFooterSignatures(page, fonts, signature, payload.issuedAt);
    this.drawQrVerification(page, fonts, qrCode, payload.verificationUrl);

    const bytes = await document.save({
      useObjectStreams: false,
    });

    return Buffer.from(bytes);
  }

  private async embedRequiredPng(
    document: PDFDocument,
    path: string,
    fileName: string,
  ): Promise<PDFImage> {
    if (!existsSync(path)) {
      throw new InternalServerErrorException(
        `Certificate asset missing: ${fileName}. Expected path: ${path}`,
      );
    }

    return document.embedPng(readFileSync(path));
  }

  private drawBackground(page: PDFPage, logo: PDFImage): void {
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();

    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(1, 1, 1),
    });

    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: pageHeight,
      color: rgb(255 / 255, 249 / 255, 237 / 255),
      opacity: 0.45,
    });

    this.drawWaves(page);

    const watermarkSize = 470;

    page.drawImage(logo, {
      x: (pageWidth - watermarkSize) / 2,
      y: 160,
      width: watermarkSize,
      height: watermarkSize,
      opacity: 0.055,
    });

    const smallLogoSize = 120;

    const positions = [
      { x: 110, y: 510 },
      { x: 850, y: 470 },
      { x: 180, y: 145 },
      { x: 790, y: 120 },
    ];

    for (const position of positions) {
      page.drawImage(logo, {
        x: position.x,
        y: position.y,
        width: smallLogoSize,
        height: smallLogoSize,
        opacity: 0.025,
      });
    }
  }

  private drawWaves(page: PDFPage): void {
    const waveColor = rgb(232 / 255, 224 / 255, 210 / 255);

    for (let row = 0; row < 58; row += 1) {
      const y = 42 + row * 12;

      let previousX = 42;
      let previousY = y;

      for (let step = 1; step <= 180; step += 1) {
        const x = 42 + step * 5.8;
        const nextY = y + Math.sin(step / 5) * 1.4;

        page.drawLine({
          start: {
            x: previousX,
            y: previousY,
          },
          end: {
            x,
            y: nextY,
          },
          thickness: 0.35,
          color: waveColor,
          opacity: 0.45,
        });

        previousX = x;
        previousY = nextY;
      }
    }
  }

  private drawCertificateFrame(page: PDFPage): void {
    const pageWidth = page.getWidth();
    const pageHeight = page.getHeight();

    const dark = rgb(30 / 255, 33 / 255, 35 / 255);
    const gold = rgb(249 / 255, 184 / 255, 28 / 255);
    const lightBorder = rgb(230 / 255, 221 / 255, 205 / 255);

    page.drawRectangle({
      x: 24,
      y: 24,
      width: pageWidth - 48,
      height: pageHeight - 48,
      borderWidth: 2.2,
      borderColor: gold,
      opacity: 0.95,
    });

    page.drawRectangle({
      x: 47,
      y: 47,
      width: pageWidth - 94,
      height: pageHeight - 94,
      borderWidth: 1,
      borderColor: lightBorder,
      opacity: 0.9,
    });

    page.drawRectangle({
      x: 0,
      y: 0,
      width: 86,
      height: 250,
      color: dark,
    });

    page.drawRectangle({
      x: 28,
      y: 18,
      width: 70,
      height: 190,
      color: gold,
      rotate: degrees(34),
    });

    page.drawRectangle({
      x: pageWidth - 78,
      y: pageHeight - 290,
      width: 92,
      height: 315,
      color: gold,
      rotate: degrees(-26),
    });

    page.drawRectangle({
      x: pageWidth - 45,
      y: pageHeight - 250,
      width: 60,
      height: 220,
      color: rgb(255 / 255, 204 / 255, 52 / 255),
      rotate: degrees(-39),
      opacity: 0.95,
    });
  }

  private drawCornerShapes(page: PDFPage): void {
    const paleGold = rgb(255 / 255, 232 / 255, 176 / 255);

    page.drawCircle({
      x: 172,
      y: 603,
      size: 215,
      color: paleGold,
      opacity: 0.16,
    });

    page.drawCircle({
      x: 916,
      y: 238,
      size: 260,
      color: paleGold,
      opacity: 0.14,
    });
  }

  private drawHeader(
    page: PDFPage,
    fonts: {
      regular: PDFFont;
      bold: PDFFont;
      italic: PDFFont;
      boldItalic: PDFFont;
    },
    logo: PDFImage,
    certificateNumber: string,
  ): void {
    const dark = rgb(30 / 255, 33 / 255, 35 / 255);

    page.drawText(`Certificate ID: ${certificateNumber}`, {
      x: 38,
      y: 746,
      size: 16,
      font: fonts.bold,
      color: dark,
    });

    page.drawImage(logo, {
      x: 475,
      y: 708,
      width: 58,
      height: 58,
    });

    page.drawText('Italir Pothe', {
      x: 545,
      y: 724,
      size: 32,
      font: fonts.bold,
      color: dark,
    });
  }

  private drawTitle(
    page: PDFPage,
    fonts: {
      regular: PDFFont;
      bold: PDFFont;
      italic: PDFFont;
      boldItalic: PDFFont;
    },
  ): void {
    const dark = rgb(30 / 255, 33 / 255, 35 / 255);
    const gold = rgb(249 / 255, 184 / 255, 28 / 255);

    this.drawCenteredTextWithShadow({
      page,
      text: 'CERTIFICATE',
      font: fonts.bold,
      size: 69,
      y: 618,
      color: dark,
      shadowColor: gold,
      shadowOffsetX: 4,
      shadowOffsetY: -4,
    });

    this.drawCenteredText({
      page,
      text: 'OF COMPLETION',
      font: fonts.regular,
      size: 45,
      y: 565,
      color: dark,
    });
  }

  private drawRecipient(
    page: PDFPage,
    fonts: {
      regular: PDFFont;
      bold: PDFFont;
      italic: PDFFont;
      boldItalic: PDFFont;
    },
    recipientName: string,
  ): void {
    const dark = rgb(30 / 255, 33 / 255, 35 / 255);

    this.drawCenteredText({
      page,
      text: 'This is to certify that',
      font: fonts.bold,
      size: 25,
      y: 505,
      color: dark,
    });

    this.drawCenteredText({
      page,
      text: recipientName,
      font: fonts.boldItalic,
      size: this.fitFontSize(recipientName, 55, 34, 850, fonts.boldItalic),
      y: 418,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: {
        x: 290,
        y: 405,
      },
      end: {
        x: 833,
        y: 405,
      },
      thickness: 1,
      color: rgb(218 / 255, 210 / 255, 196 / 255),
      opacity: 0.65,
    });
  }

  private drawCourseInfo(
    page: PDFPage,
    fonts: {
      regular: PDFFont;
      bold: PDFFont;
      italic: PDFFont;
      boldItalic: PDFFont;
    },
    courseTitle: string,
  ): void {
    const dark = rgb(30 / 255, 33 / 255, 35 / 255);

    this.drawCenteredText({
      page,
      text: 'has successfully completed the course of',
      font: fonts.bold,
      size: 25,
      y: 354,
      color: dark,
    });

    this.drawCenteredText({
      page,
      text: courseTitle,
      font: fonts.bold,
      size: this.fitFontSize(courseTitle, 34, 22, 960, fonts.bold),
      y: 302,
      color: rgb(0, 0, 0),
    });
  }

  private drawAwardBadge(
    page: PDFPage,
    fonts: {
      regular: PDFFont;
      bold: PDFFont;
      italic: PDFFont;
      boldItalic: PDFFont;
    },
    award: PDFImage,
  ): void {
    page.drawImage(award, {
      x: 510,
      y: 205,
      width: 96,
      height: 96,
      opacity: 0.96,
    });

    this.drawCenteredText({
      page,
      text: 'VERIFIED',
      font: fonts.bold,
      size: 11,
      y: 191,
      color: rgb(90 / 255, 90 / 255, 90 / 255),
    });
  }

  private drawFooterSignatures(
    page: PDFPage,
    fonts: {
      regular: PDFFont;
      bold: PDFFont;
      italic: PDFFont;
      boldItalic: PDFFont;
    },
    signature: PDFImage,
    issuedAt: Date,
  ): void {
    const dark = rgb(30 / 255, 33 / 255, 35 / 255);

    const issueDate = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      timeZone: 'UTC',
    }).format(issuedAt);

    page.drawText(`Issued on ${issueDate}`, {
      x: 487,
      y: 132,
      size: 12,
      font: fonts.regular,
      color: dark,
    });

    page.drawImage(signature, {
      x: 115,
      y: 113,
      width: 190,
      height: 62,
    });

    page.drawLine({
      start: {
        x: 126,
        y: 108,
      },
      end: {
        x: 318,
        y: 108,
      },
      thickness: 1,
      color: dark,
      opacity: 0.65,
    });

    page.drawText('REGISTRAR SIGNATURE', {
      x: 151,
      y: 86,
      size: 10,
      font: fonts.bold,
      color: dark,
    });

    page.drawText('Italir Pothe Registrar', {
      x: 149,
      y: 69,
      size: 10,
      font: fonts.regular,
      color: dark,
    });
  }

  private drawQrVerification(
    page: PDFPage,
    fonts: {
      regular: PDFFont;
      bold: PDFFont;
      italic: PDFFont;
      boldItalic: PDFFont;
    },
    qrCode: PDFImage,
    verificationUrl: string,
  ): void {
    const dark = rgb(30 / 255, 33 / 255, 35 / 255);

    page.drawImage(qrCode, {
      x: 902,
      y: 79,
      width: 105,
      height: 105,
    });

    page.drawText('Scan to verify', {
      x: 924,
      y: 61,
      size: 10,
      font: fonts.bold,
      color: dark,
    });

    page.drawText(verificationUrl, {
      x: 377,
      y: 67,
      size: 6.5,
      font: fonts.regular,
      color: rgb(80 / 255, 80 / 255, 80 / 255),
      maxWidth: 355,
    });
  }

  private drawCenteredText(params: {
    page: PDFPage;
    text: string;
    font: PDFFont;
    size: number;
    y: number;
    color: ReturnType<typeof rgb>;
  }): void {
    const pageWidth = params.page.getWidth();
    const textWidth = params.font.widthOfTextAtSize(params.text, params.size);

    params.page.drawText(params.text, {
      x: Math.max(30, (pageWidth - textWidth) / 2),
      y: params.y,
      size: params.size,
      font: params.font,
      color: params.color,
    });
  }

  private drawCenteredTextWithShadow(params: {
    page: PDFPage;
    text: string;
    font: PDFFont;
    size: number;
    y: number;
    color: ReturnType<typeof rgb>;
    shadowColor: ReturnType<typeof rgb>;
    shadowOffsetX: number;
    shadowOffsetY: number;
  }): void {
    const pageWidth = params.page.getWidth();
    const textWidth = params.font.widthOfTextAtSize(params.text, params.size);

    const x = Math.max(30, (pageWidth - textWidth) / 2);

    params.page.drawText(params.text, {
      x: x + params.shadowOffsetX,
      y: params.y + params.shadowOffsetY,
      size: params.size,
      font: params.font,
      color: params.shadowColor,
    });

    params.page.drawText(params.text, {
      x,
      y: params.y,
      size: params.size,
      font: params.font,
      color: params.color,
    });
  }

  private fitFontSize(
    text: string,
    preferredSize: number,
    minimumSize: number,
    maximumWidth: number,
    font: PDFFont,
  ): number {
    let size = preferredSize;

    while (
      size > minimumSize &&
      font.widthOfTextAtSize(text, size) > maximumWidth
    ) {
      size -= 1;
    }

    return size;
  }
}
