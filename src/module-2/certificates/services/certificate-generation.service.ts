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

    this.drawImageContain(page, logo, {
      x: (width - 520) / 2,
      y: 140,
      maxWidth: 520,
      maxHeight: 520,
      opacity: 0.035,
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

    const darkBorder = rgb(48 / 255, 125 / 255, 60 / 255);
    const lightBorder = rgb(88 / 255, 174 / 255, 64 / 255);

    // Outer continuous thin border
    page.drawRectangle({
      x: 18,
      y: 18,
      width: width - 36,
      height: height - 36,
      borderWidth: 2,
      borderColor: darkBorder,
    });

    // Inner continuous thin border
    page.drawRectangle({
      x: 24,
      y: 24,
      width: width - 48,
      height: height - 48,
      borderWidth: 1,
      borderColor: lightBorder,
    });
  }

  private drawGreenCornerFrame(page: PDFPage): void {
    const width = page.getWidth();
    const height = page.getHeight();

    // Matching exact frame colors
    const lightGreen = rgb(88 / 255, 174 / 255, 64 / 255);
    const darkGreen = rgb(48 / 255, 125 / 255, 60 / 255);
    const shadow = rgb(0, 0, 0);

    /**
     * BOTTOM-LEFT CORNER
     * Based on exact layout from "Certificate Frame and Border Structure.png"
     */

    // Bottom-Left Outer (Dark Green)
    page.drawSvgPath('M 0 350 L 45 305 L 45 45 L 355 45 L 400 0 L 0 0 Z', {
      color: darkGreen,
    });

    // Bottom-Left Inner subtle drop shadow
    page.drawSvgPath('M 22 328 L 67 283 L 67 63 L 337 63 L 382 18 L 22 18 Z', {
      color: shadow,
      opacity: 0.15,
    });

    // Bottom-Left Inner (Light Green)
    page.drawSvgPath('M 20 330 L 65 285 L 65 65 L 335 65 L 380 20 L 20 20 Z', {
      color: lightGreen,
    });

    /**
     * TOP-RIGHT CORNER
     */

    // Top-Right Outer (Light Green)
    page.drawSvgPath(
      `M ${width} ${height - 350} L ${width - 45} ${height - 305} L ${width - 45} ${height - 45} L ${width - 355} ${height - 45} L ${width - 400} ${height} L ${width} ${height} Z`,
      {
        color: lightGreen,
      },
    );

    // Top-Right Inner subtle drop shadow
    page.drawSvgPath(
      `M ${width - 22} ${height - 328} L ${width - 67} ${height - 283} L ${width - 67} ${height - 63} L ${width - 337} ${height - 63} L ${width - 382} ${height - 18} L ${width - 22} ${height - 18} Z`,
      {
        color: shadow,
        opacity: 0.15,
      },
    );

    // Top-Right Inner (Dark Green)
    page.drawSvgPath(
      `M ${width - 20} ${height - 330} L ${width - 65} ${height - 285} L ${width - 65} ${height - 65} L ${width - 335} ${height - 65} L ${width - 380} ${height - 20} L ${width - 20} ${height - 20} Z`,
      {
        color: darkGreen,
      },
    );
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
      y: 714,
      size: 16,
      font: fonts.bold,
      color: dark,
    });

    const logoBoxX = 430;
    const logoBoxY = 645;

    this.drawImageContain(page, logo, {
      x: logoBoxX,
      y: logoBoxY,
      maxWidth: 64,
      maxHeight: 64,
    });

    page.drawText('Italir Pothe', {
      x: logoBoxX + 76,
      y: logoBoxY + 17,
      size: 31,
      font: fonts.bold,
      color: dark,
    });
  }

  private drawCertifiedBadge(
    page: PDFPage,
    fonts: CertificateFonts,
    award: PDFImage,
  ): void {
    const green = rgb(0 / 255, 105 / 255, 55 / 255);

    const badgeCenterX = 930;
    const awardSize = 92;
    const awardY = 604;

    this.drawImageContain(page, award, {
      x: badgeCenterX - awardSize / 2,
      y: awardY,
      maxWidth: awardSize,
      maxHeight: awardSize,
    });

    const text = 'CERTIFIED';
    const textSize = 16;
    const textWidth = fonts.bold.widthOfTextAtSize(text, textSize);

    page.drawText(text, {
      x: badgeCenterX - textWidth / 2,
      y: awardY - 24,
      size: textSize,
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
      size: 68,
      y: 560,
      color: dark,
      shadowColor: greenShadow,
      shadowOffsetX: 3,
      shadowOffsetY: -3,
    });

    this.drawCenteredText({
      page,
      text: 'OF COMPLETION',
      font: fonts.regular,
      size: 39,
      y: 514,
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
      y: 455,
      color: dark,
    });

    this.drawCenteredText({
      page,
      text: recipientName,
      font: fonts.studentName,
      size: this.fitFontSize(recipientName, 58, 34, 800, fonts.studentName),
      y: 382,
      color: rgb(0, 0, 0),
    });

    page.drawLine({
      start: { x: 365, y: 365 },
      end: { x: 758, y: 365 },
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
      y: 322,
      color: dark,
    });

    this.drawCenteredText({
      page,
      text: courseTitle,
      font: fonts.bold,
      size: this.fitFontSize(courseTitle, 31, 21, 900, fonts.bold),
      y: 276,
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
      x: 142,
      y: 124,
      width: 200,
      height: 66,
    });

    page.drawLine({
      start: { x: 140, y: 118 },
      end: { x: 335, y: 118 },
      thickness: 1,
      color: dark,
      opacity: 0.7,
    });

    page.drawText('REGISTRAR SIGNATURE', {
      x: 163,
      y: 97,
      size: 10,
      font: fonts.bold,
      color: dark,
    });

    page.drawText('Italir Pothe Registrar', {
      x: 164,
      y: 81,
      size: 10,
      font: fonts.regular,
      color: dark,
    });

    this.drawCenteredText({
      page,
      text: `Issued on ${issueDate}`,
      font: fonts.regular,
      size: 12,
      y: 123,
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
      x: 902,
      y: 112,
      width: 105,
      height: 105,
    });

    page.drawText('Scan to verify', {
      x: 925,
      y: 92,
      size: 10,
      font: fonts.bold,
      color: dark,
    });

    const maxWidth = 430;
    const fontSize = 6.4;

    page.drawText(verificationUrl, {
      x: (page.getWidth() - maxWidth) / 2,
      y: 78,
      size: fontSize,
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

  private drawImageContain(
    page: PDFPage,
    image: PDFImage,
    params: {
      x: number;
      y: number;
      maxWidth: number;
      maxHeight: number;
      opacity?: number;
    },
  ): void {
    const scaled = image.scaleToFit(params.maxWidth, params.maxHeight);

    page.drawImage(image, {
      x: params.x + (params.maxWidth - scaled.width) / 2,
      y: params.y + (params.maxHeight - scaled.height) / 2,
      width: scaled.width,
      height: scaled.height,
      opacity: params.opacity ?? 1,
    });
  }
}
