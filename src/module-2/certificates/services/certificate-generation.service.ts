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
import * as fontkit from '@pdf-lib/fontkit';
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

interface CertificateFonts {
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  certificate: PDFFont;
  studentName: PDFFont;
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

  private readonly rengkoxFontPath = join(
    this.assetDirectory,
    'fonts',
    'Rengkox.ttf',
  );

  private readonly silenthaFontPath = join(
    this.assetDirectory,
    'fonts',
    'Silentha.ttf',
  );

  async generatePdf(payload: GenerateCertificatePdfPayload): Promise<Buffer> {
    const document = await PDFDocument.create();

    document.registerFontkit(fontkit);

    const page = document.addPage([1123, 794]);

    const fonts = await this.loadFonts(document);

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
        dark: '#005A34',
        light: '#FFFFFF',
      },
    });

    const qrCode = await document.embedPng(qrBuffer);

    this.drawBackground(page, logo);
    this.drawGreenFrame(page);
    this.drawGreenCornerFrame(page);
    this.drawHeader(page, fonts, logo, payload.certificateNumber);
    this.drawCertifiedBadge(page, fonts, award);
    this.drawTitle(page, fonts);
    this.drawRecipient(page, fonts, payload.recipientName);
    this.drawCourseInfo(page, fonts, payload.courseTitle);
    this.drawFooterSignature(page, fonts, signature, payload.issuedAt);
    this.drawQrVerification(page, fonts, qrCode, payload.verificationUrl);

    const bytes = await document.save({
      useObjectStreams: false,
    });

    return Buffer.from(bytes);
  }

  private async loadFonts(document: PDFDocument): Promise<CertificateFonts> {
    const [regular, bold, italic] = await Promise.all([
      document.embedFont(StandardFonts.Helvetica),
      document.embedFont(StandardFonts.HelveticaBold),
      document.embedFont(StandardFonts.HelveticaOblique),
    ]);

    const certificate = await this.embedRequiredFont(
      document,
      this.rengkoxFontPath,
      'Rengkox.ttf',
    );

    const studentName = await this.embedRequiredFont(
      document,
      this.silenthaFontPath,
      'Silentha.ttf',
    );

    return {
      regular,
      bold,
      italic,
      certificate,
      studentName,
    };
  }

  private async embedRequiredFont(
    document: PDFDocument,
    path: string,
    fileName: string,
  ): Promise<PDFFont> {
    if (!existsSync(path)) {
      throw new InternalServerErrorException(
        `Certificate font missing: ${fileName}. Expected path: ${path}`,
      );
    }

    return document.embedFont(readFileSync(path));
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
    const width = page.getWidth();
    const height = page.getHeight();

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: rgb(247 / 255, 255 / 255, 244 / 255),
    });

    page.drawRectangle({
      x: 0,
      y: 0,
      width,
      height,
      color: rgb(225 / 255, 255 / 255, 218 / 255),
      opacity: 0.28,
    });

    this.drawWaveTexture(page);

    const watermarkSize = 510;

    page.drawImage(logo, {
      x: (width - watermarkSize) / 2,
      y: 145,
      width: watermarkSize,
      height: watermarkSize,
      opacity: 0.045,
    });

    const smallSize = 130;

    const texturePositions = [
      { x: 120, y: 500, opacity: 0.025 },
      { x: 855, y: 505, opacity: 0.024 },
      { x: 165, y: 130, opacity: 0.022 },
      { x: 790, y: 118, opacity: 0.022 },
    ];

    for (const item of texturePositions) {
      page.drawImage(logo, {
        x: item.x,
        y: item.y,
        width: smallSize,
        height: smallSize,
        opacity: item.opacity,
      });
    }
  }

  private drawWaveTexture(page: PDFPage): void {
    const waveColor = rgb(166 / 255, 198 / 255, 158 / 255);

    for (let row = 0; row < 58; row += 1) {
      const y = 52 + row * 11.5;

      let previousX = 48;
      let previousY = y;

      for (let step = 1; step <= 178; step += 1) {
        const x = 48 + step * 5.8;
        const nextY = y + Math.sin(step / 5) * 1.25;

        page.drawLine({
          start: {
            x: previousX,
            y: previousY,
          },
          end: {
            x,
            y: nextY,
          },
          thickness: 0.32,
          color: waveColor,
          opacity: 0.22,
        });

        previousX = x;
        previousY = nextY;
      }
    }
  }

  private drawGreenFrame(page: PDFPage): void {
    const width = page.getWidth();
    const height = page.getHeight();

    const green = rgb(0 / 255, 105 / 255, 55 / 255);
    const lightGreen = rgb(120 / 255, 255 / 255, 86 / 255);
    const softGreen = rgb(212 / 255, 255 / 255, 202 / 255);

    page.drawRectangle({
      x: 26,
      y: 26,
      width: width - 52,
      height: height - 52,
      borderWidth: 2.3,
      borderColor: green,
    });

    page.drawRectangle({
      x: 42,
      y: 42,
      width: width - 84,
      height: height - 84,
      borderWidth: 1,
      borderColor: softGreen,
    });

    page.drawRectangle({
      x: 34,
      y: 34,
      width: width - 68,
      height: height - 68,
      borderWidth: 1,
      borderColor: lightGreen,
      opacity: 0.55,
    });
  }

  private drawGreenCornerFrame(page: PDFPage): void {
    const width = page.getWidth();
    const height = page.getHeight();

    const deepGreen = rgb(0 / 255, 78 / 255, 42 / 255);
    const brightGreen = rgb(61 / 255, 242 / 255, 34 / 255);
    const lightGreen = rgb(128 / 255, 255 / 255, 92 / 255);

    page.drawRectangle({
      x: 0,
      y: 0,
      width: 83,
      height: 250,
      color: deepGreen,
      opacity: 0.96,
    });

    page.drawRectangle({
      x: 28,
      y: 12,
      width: 70,
      height: 216,
      color: brightGreen,
      rotate: degrees(35),
      opacity: 0.98,
    });

    page.drawRectangle({
      x: 12,
      y: -10,
      width: 50,
      height: 190,
      color: lightGreen,
      rotate: degrees(-20),
      opacity: 0.9,
    });

    page.drawRectangle({
      x: width - 282,
      y: height - 36,
      width: 288,
      height: 43,
      color: brightGreen,
      opacity: 0.98,
    });

    page.drawRectangle({
      x: width - 232,
      y: height - 67,
      width: 260,
      height: 38,
      color: lightGreen,
      rotate: degrees(-2),
      opacity: 0.95,
    });

    page.drawRectangle({
      x: width - 100,
      y: height - 332,
      width: 72,
      height: 270,
      color: deepGreen,
      rotate: degrees(-23),
      opacity: 0.95,
    });

    page.drawRectangle({
      x: width - 76,
      y: height - 300,
      width: 48,
      height: 218,
      color: brightGreen,
      rotate: degrees(-35),
      opacity: 0.92,
    });
  }

  private drawHeader(
    page: PDFPage,
    fonts: CertificateFonts,
    logo: PDFImage,
    certificateNumber: string,
  ): void {
    const dark = rgb(22 / 255, 28 / 255, 25 / 255);

    page.drawText(`Certificate ID: ${certificateNumber}`, {
      x: 48,
      y: 733,
      size: 16,
      font: fonts.bold,
      color: dark,
    });

    const logoWidth = 285;
    const logoHeight = 72;

    page.drawImage(logo, {
      x: (page.getWidth() - logoWidth) / 2,
      y: 681,
      width: logoWidth,
      height: logoHeight,
    });
  }

  private drawCertifiedBadge(
    page: PDFPage,
    fonts: CertificateFonts,
    award: PDFImage,
  ): void {
    const green = rgb(0 / 255, 105 / 255, 55 / 255);
    const badgeX = 898;
    const badgeY = 594;

    page.drawRectangle({
      x: badgeX - 17,
      y: badgeY - 23,
      width: 126,
      height: 142,
      borderColor: green,
      borderWidth: 1.3,
      color: rgb(1, 1, 1),
      opacity: 0.62,
    });

    page.drawImage(award, {
      x: badgeX + 16,
      y: badgeY + 37,
      width: 56,
      height: 56,
      opacity: 0.98,
    });

    page.drawText('CERTIFIED', {
      x: badgeX + 4,
      y: badgeY + 13,
      size: 16,
      font: fonts.bold,
      color: green,
    });
  }

  private drawTitle(page: PDFPage, fonts: CertificateFonts): void {
    const dark = rgb(18 / 255, 24 / 255, 22 / 255);
    const greenShadow = rgb(85 / 255, 222 / 255, 55 / 255);

    this.drawCenteredTextWithShadow({
      page,
      text: 'CERTIFICATE',
      font: fonts.certificate,
      size: 74,
      y: 592,
      color: dark,
      shadowColor: greenShadow,
      shadowOffsetX: 4,
      shadowOffsetY: -4,
    });

    this.drawCenteredText({
      page,
      text: 'OF COMPLETION',
      font: fonts.regular,
      size: 42,
      y: 543,
      color: dark,
    });
  }

  private drawRecipient(
    page: PDFPage,
    fonts: CertificateFonts,
    recipientName: string,
  ): void {
    const dark = rgb(22 / 255, 28 / 255, 25 / 255);

    this.drawCenteredText({
      page,
      text: 'This is to certify that',
      font: fonts.bold,
      size: 24,
      y: 488,
      color: dark,
    });

    this.drawCenteredText({
      page,
      text: recipientName,
      font: fonts.studentName,
      size: this.fitFontSize(recipientName, 60, 34, 800, fonts.studentName),
      y: 410,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: {
        x: 365,
        y: 396,
      },
      end: {
        x: 758,
        y: 396,
      },
      thickness: 1,
      color: rgb(150 / 255, 205 / 255, 137 / 255),
      opacity: 0.8,
    });
  }

  private drawCourseInfo(
    page: PDFPage,
    fonts: CertificateFonts,
    courseTitle: string,
  ): void {
    const dark = rgb(22 / 255, 28 / 255, 25 / 255);

    this.drawCenteredText({
      page,
      text: 'has successfully completed the course of',
      font: fonts.bold,
      size: 23,
      y: 350,
      color: dark,
    });

    this.drawCenteredText({
      page,
      text: courseTitle,
      font: fonts.bold,
      size: this.fitFontSize(courseTitle, 31, 21, 900, fonts.bold),
      y: 302,
      color: rgb(0, 0, 0),
    });
  }

  private drawFooterSignature(
    page: PDFPage,
    fonts: CertificateFonts,
    signature: PDFImage,
    issuedAt: Date,
  ): void {
    const dark = rgb(22 / 255, 28 / 255, 25 / 255);

    const issueDate = new Intl.DateTimeFormat('en', {
      year: 'numeric',
      month: 'long',
      day: '2-digit',
      timeZone: 'UTC',
    }).format(issuedAt);

    page.drawImage(signature, {
      x: 128,
      y: 111,
      width: 200,
      height: 66,
    });

    page.drawLine({
      start: {
        x: 126,
        y: 104,
      },
      end: {
        x: 320,
        y: 104,
      },
      thickness: 1,
      color: dark,
      opacity: 0.7,
    });

    page.drawText('REGISTRAR SIGNATURE', {
      x: 151,
      y: 82,
      size: 10,
      font: fonts.bold,
      color: dark,
    });

    page.drawText('Italir Pothe Registrar', {
      x: 151,
      y: 66,
      size: 10,
      font: fonts.regular,
      color: dark,
    });

    this.drawCenteredText({
      page,
      text: `Issued on ${issueDate}`,
      font: fonts.regular,
      size: 12,
      y: 126,
      color: dark,
    });
  }

  private drawQrVerification(
    page: PDFPage,
    fonts: CertificateFonts,
    qrCode: PDFImage,
    verificationUrl: string,
  ): void {
    const dark = rgb(22 / 255, 28 / 255, 25 / 255);

    page.drawImage(qrCode, {
      x: 893,
      y: 82,
      width: 108,
      height: 108,
    });

    page.drawText('Scan to verify', {
      x: 918,
      y: 62,
      size: 10,
      font: fonts.bold,
      color: dark,
    });

    const maxWidth = 430;
    const urlFontSize = 6.4;
    const urlWidth = Math.min(
      fonts.regular.widthOfTextAtSize(verificationUrl, urlFontSize),
      maxWidth,
    );

    page.drawText(verificationUrl, {
      x: (page.getWidth() - urlWidth) / 2,
      y: 57,
      size: urlFontSize,
      font: fonts.regular,
      color: rgb(70 / 255, 80 / 255, 75 / 255),
      maxWidth,
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
    const textWidth = params.font.widthOfTextAtSize(params.text, params.size);

    params.page.drawText(params.text, {
      x: Math.max(58, (params.page.getWidth() - textWidth) / 2),
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
    const textWidth = params.font.widthOfTextAtSize(params.text, params.size);

    const x = Math.max(58, (params.page.getWidth() - textWidth) / 2);

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
