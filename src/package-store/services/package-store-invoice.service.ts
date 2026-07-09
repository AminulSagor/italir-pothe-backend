import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PDFDocument,
  PDFFont,
  PDFImage,
  PDFPage,
  StandardFonts,
  rgb,
} from 'pdf-lib';
import { existsSync, readFileSync } from 'fs';
import { extname, join } from 'path';

import { StoreOrder } from '../entities/store-order.entity';

export type PackageStoreInvoiceResult = {
  fileName: string;
  pdfBuffer: Buffer;
};

type Fonts = {
  regular: PDFFont;
  bold: PDFFont;
  oblique: PDFFont;
};

type InvoiceRow = {
  label: string;
  value: string | number | null | undefined;
};

const PAGE = {
  width: 595.28,
  height: 841.89,
  margin: 34,
};

const COLORS = {
  primary: rgb(0 / 255, 107 / 255, 63 / 255),
  primarySoft: rgb(234 / 255, 255 / 255, 240 / 255),
  primaryLight: rgb(114 / 255, 240 / 255, 79 / 255),
  text: rgb(24 / 255, 35 / 255, 29 / 255),
  muted: rgb(101 / 255, 116 / 255, 106 / 255),
  border: rgb(218 / 255, 232 / 255, 222 / 255),
  white: rgb(1, 1, 1),
  surface: rgb(250 / 255, 255 / 255, 248 / 255),
  warningBg: rgb(255 / 255, 251 / 255, 235 / 255),
  warningText: rgb(111 / 255, 83 / 255, 0 / 255),
  success: rgb(6 / 255, 122 / 255, 53 / 255),
  danger: rgb(180 / 255, 35 / 255, 24 / 255),
};

@Injectable()
export class PackageStoreInvoiceService {
  constructor(private readonly config: ConfigService) {}

  async buildInvoice(order: StoreOrder): Promise<PackageStoreInvoiceResult> {
    const pdfDoc = await PDFDocument.create();

    const page = pdfDoc.addPage([PAGE.width, PAGE.height]);

    const fonts: Fonts = {
      regular: await pdfDoc.embedFont(StandardFonts.Helvetica),
      bold: await pdfDoc.embedFont(StandardFonts.HelveticaBold),
      oblique: await pdfDoc.embedFont(StandardFonts.HelveticaOblique),
    };

    const logo = await this.tryEmbedLogo(pdfDoc);

    const orderAny = order as any;

    const orderNumber = this.pickString(orderAny, ['orderNumber'], 'ORDER');
    const invoiceNumber = `INV-${orderNumber}`;
    const status = this.pickString(orderAny, ['status'], 'COMPLETED');
    const isRefunded = status.toUpperCase() === 'REFUNDED';

    const packageName = this.pickString(
      orderAny,
      ['snapshot.packageName', 'package.name', 'packageName'],
      'Italir Pothe Package',
    );

    const packageDescription = this.pickString(
      orderAny,
      ['snapshot.packageDescription', 'package.description', 'description'],
      '',
    );

    const buyerName = this.pickString(
      orderAny,
      [
        'user.fullName',
        'user.name',
        'user.fullLegalName',
        'user.displayName',
        'customerName',
        'user.email',
      ],
      'Customer',
    );

    const buyerEmail = this.pickString(
      orderAny,
      ['user.email', 'customerEmail'],
      '-',
    );

    const buyerPhone = this.pickString(
      orderAny,
      ['user.phone', 'user.phoneNumber', 'customerPhone'],
      '-',
    );

    const paymentProvider = this.toTitleLabel(
      this.pickString(
        orderAny,
        [
          'payment.provider',
          'paymentMethod',
          'payment.paymentProvider',
          'providerSnapshot.provider',
        ],
        '-',
      ),
    );

    const paymentReference = this.pickString(
      orderAny,
      [
        'payment.providerReference',
        'payment.reference',
        'payment.transactionReference',
        'providerTransaction.providerTransactionId',
        'providerTransaction.transactionId',
        'providerTransaction.tokenHash',
      ],
      '-',
    );

    const providerProductId = this.pickString(
      orderAny,
      [
        'providerSnapshot.productId',
        'providerSnapshot.providerProductId',
        'providerTransaction.productId',
        'productId',
      ],
      '-',
    );

    const basePlanId = this.pickString(
      orderAny,
      ['providerSnapshot.basePlanId', 'basePlanId'],
      '-',
    );

    const offerId = this.pickString(
      orderAny,
      ['providerSnapshot.offerId', 'offerId'],
      '-',
    );

    const productType = this.toTitleLabel(
      this.pickString(
        orderAny,
        ['providerSnapshot.productType', 'snapshot.packageType'],
        '-',
      ),
    );

    const currency = this.pickString(
      orderAny,
      ['pricing.paymentCurrency', 'payment.currency', 'currency'],
      'EUR',
    );

    const basePriceEur = this.pickNumber(orderAny, [
      'pricing.basePriceEur',
      'pricing.basePrice',
    ]);

    const discountPercentage = this.pickNumber(orderAny, [
      'pricing.discountPercentage',
    ]);

    const discountAmountEur = this.pickNumber(orderAny, [
      'pricing.discountAmountEur',
      'pricing.discountAmount',
    ]);

    const couponCode = this.pickString(
      orderAny,
      ['pricing.couponCode', 'couponCode'],
      '',
    );

    const configuredPayableEur = this.pickNumber(orderAny, [
      'pricing.totalAmountEur',
      'pricing.payableAmountEur',
      'pricing.finalAmountEur',
    ]);

    const paidAmount = this.pickNumber(orderAny, [
      'pricing.paymentAmount',
      'payment.amount',
      'payment.paidAmount',
    ]);

    const invoiceDate = this.formatDateTime(
      this.pickValue(orderAny, ['payment.paidAt', 'createdAt']) as
        | Date
        | string
        | null,
    );

    this.drawBackground(page, logo);

    this.drawHeader(page, fonts, logo, {
      invoiceNumber,
      invoiceDate,
      isRefunded,
    });

    let y = 690;

    this.drawInfoCard(page, fonts, 34, y, 250, 116, 'ORDER INFORMATION', [
      { label: 'Invoice No', value: invoiceNumber },
      { label: 'Order No', value: orderNumber },
      { label: 'Order Status', value: this.toTitleLabel(status) },
      {
        label: isRefunded ? 'Refunded At' : 'Paid At',
        value: this.formatDateTime(
          this.pickValue(orderAny, [
            isRefunded ? 'payment.refundedAt' : 'payment.paidAt',
            'updatedAt',
            'createdAt',
          ]) as Date | string | null,
        ),
      },
    ]);

    this.drawInfoCard(page, fonts, 306, y, 255, 116, 'CUSTOMER INFORMATION', [
      { label: 'Name', value: buyerName },
      { label: 'Email', value: buyerEmail },
      { label: 'Phone', value: buyerPhone },
      { label: 'User ID', value: this.pickString(orderAny, ['userId'], '-') },
    ]);

    y -= 142;

    this.drawPackageCard(page, fonts, {
      x: 34,
      y,
      width: 527,
      height: 128,
      packageName,
      packageDescription,
      productType,
      providerProductId,
      basePriceEur,
      order,
    });

    y -= 154;

    this.drawInfoCard(page, fonts, 34, y, 250, 132, 'PAYMENT METHOD', [
      { label: 'Method', value: paymentProvider },
      { label: 'Payment Ref', value: paymentReference },
      {
        label: 'Transaction ID',
        value: this.pickString(
          orderAny,
          [
            'providerTransaction.providerTransactionId',
            'providerTransaction.transactionId',
            'providerTransaction.originalTransactionId',
          ],
          '-',
        ),
      },
      {
        label: 'Verification',
        value: this.toTitleLabel(
          this.pickString(
            orderAny,
            ['providerTransaction.verificationStatus'],
            '-',
          ),
        ),
      },
      {
        label: 'Environment',
        value: this.toTitleLabel(
          this.pickString(orderAny, ['providerTransaction.environment'], '-'),
        ),
      },
    ]);

    this.drawInfoCard(page, fonts, 306, y, 255, 132, 'PAYMENT DETAILS', [
      { label: 'Store Product ID', value: providerProductId },
      { label: 'Product Type', value: productType },
      { label: 'Base Plan ID', value: basePlanId },
      { label: 'Offer ID', value: offerId },
      { label: 'Currency', value: currency },
    ]);

    y -= 158;

    this.drawSummaryCard(page, fonts, {
      x: 306,
      y,
      width: 255,
      basePriceEur,
      discountPercentage,
      discountAmountEur,
      couponCode,
      configuredPayableEur,
      paidAmount,
      currency,
      isRefunded,
    });

    this.drawNoteCard(
      page,
      fonts,
      34,
      y,
      250,
      144,
      'IMPORTANT STORE PRICING NOTE',
      this.config.get<string>('ITALIR_POTHE_INVOICE_TAX_NOTE') ||
        'Google Play or App Store controls the final localized charge. Local VAT, tax, regional pricing, and currency conversion may be included in the official store receipt.',
    );

    this.drawFooter(page, fonts);

    const bytes = await pdfDoc.save({
      useObjectStreams: false,
    });

    return {
      fileName: `italir-pothe-invoice-${this.safeFileName(orderNumber)}.pdf`,
      pdfBuffer: Buffer.from(bytes),
    };
  }

  private async tryEmbedLogo(document: PDFDocument): Promise<PDFImage | null> {
    const configuredPath = this.config
      .get<string>('ITALIR_POTHE_LOGO_PATH')
      ?.trim();

    const candidates = [
      configuredPath,
      join(process.cwd(), 'assets', 'certificates', 'italir_pothe_logo.png'),
      join(
        process.cwd(),
        'src',
        'assets',
        'certificates',
        'italir_pothe_logo.png',
      ),
      join(
        process.cwd(),
        'dist',
        'assets',
        'certificates',
        'italir_pothe_logo.png',
      ),
      join(
        process.cwd(),
        'dist',
        'src',
        'assets',
        'certificates',
        'italir_pothe_logo.png',
      ),
    ].filter(Boolean) as string[];

    for (const filePath of candidates) {
      if (!existsSync(filePath)) {
        continue;
      }

      const bytes = readFileSync(filePath);
      const extension = extname(filePath).toLowerCase();

      if (extension === '.jpg' || extension === '.jpeg') {
        return document.embedJpg(bytes);
      }

      return document.embedPng(bytes);
    }

    return null;
  }

  private drawBackground(page: PDFPage, logo: PDFImage | null): void {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE.width,
      height: PAGE.height,
      color: COLORS.surface,
    });

    page.drawRectangle({
      x: 0,
      y: 0,
      width: PAGE.width,
      height: PAGE.height,
      color: COLORS.primarySoft,
      opacity: 0.28,
    });

    this.drawWaveTexture(page);

    if (!logo) {
      return;
    }

    this.drawImageContain(page, logo, {
      x: 130,
      y: 305,
      maxWidth: 335,
      maxHeight: 335,
      opacity: 0.035,
    });

    const positions = [
      { x: 52, y: 608, size: 92, opacity: 0.025 },
      { x: 456, y: 620, size: 92, opacity: 0.025 },
      { x: 64, y: 122, size: 92, opacity: 0.02 },
      { x: 452, y: 122, size: 92, opacity: 0.02 },
      { x: 248, y: 58, size: 78, opacity: 0.018 },
    ];

    for (const item of positions) {
      this.drawImageContain(page, logo, {
        x: item.x,
        y: item.y,
        maxWidth: item.size,
        maxHeight: item.size,
        opacity: item.opacity,
      });
    }
  }

  private drawWaveTexture(page: PDFPage): void {
    const waveColor = rgb(178 / 255, 211 / 255, 169 / 255);

    for (let row = 0; row < 68; row += 1) {
      const y = 34 + row * 12;
      let previousX = 28;
      let previousY = y;

      for (let step = 1; step <= 92; step += 1) {
        const x = 28 + step * 6.2;
        const nextY = y + Math.sin(step / 5) * 1.1;

        page.drawLine({
          start: { x: previousX, y: previousY },
          end: { x, y: nextY },
          thickness: 0.25,
          color: waveColor,
          opacity: 0.13,
        });

        previousX = x;
        previousY = nextY;
      }
    }
  }

  private drawHeader(
    page: PDFPage,
    fonts: Fonts,
    logo: PDFImage | null,
    data: {
      invoiceNumber: string;
      invoiceDate: string;
      isRefunded: boolean;
    },
  ): void {
    page.drawRectangle({
      x: 0,
      y: PAGE.height - 12,
      width: PAGE.width,
      height: 12,
      color: COLORS.primary,
    });

    page.drawRectangle({
      x: 0,
      y: PAGE.height - 12,
      width: PAGE.width,
      height: 12,
      color: COLORS.primaryLight,
      opacity: 0.22,
    });

    if (logo) {
      this.drawImageContain(page, logo, {
        x: 38,
        y: 742,
        maxWidth: 56,
        maxHeight: 56,
      });
    } else {
      page.drawRectangle({
        x: 38,
        y: 742,
        width: 56,
        height: 56,
        color: COLORS.primary,
      });

      this.drawText(page, 'IP', 55, 763, fonts.bold, 16, COLORS.white);
    }

    this.drawText(
      page,
      'Italir Pothe',
      108,
      776,
      fonts.bold,
      24,
      COLORS.primary,
    );
    this.drawText(
      page,
      'Italian learning, AI bundle, CV credit and digital package service',
      108,
      758,
      fonts.regular,
      9.5,
      COLORS.muted,
    );

    this.drawText(page, 'INVOICE', 438, 778, fonts.bold, 26, COLORS.primary);
    this.drawText(
      page,
      data.invoiceNumber,
      438,
      756,
      fonts.bold,
      10.5,
      COLORS.text,
    );
    this.drawText(
      page,
      data.invoiceDate,
      438,
      740,
      fonts.regular,
      9,
      COLORS.muted,
    );

    const pillColor = data.isRefunded ? COLORS.danger : COLORS.success;
    const pillText = data.isRefunded ? 'REFUNDED' : 'PAID';

    page.drawRectangle({
      x: 438,
      y: 710,
      width: 86,
      height: 22,
      color: data.isRefunded
        ? rgb(254 / 255, 228 / 255, 226 / 255)
        : rgb(221 / 255, 248 / 255, 231 / 255),
      borderColor: pillColor,
      borderWidth: 0.8,
    });

    this.drawText(page, pillText, 456, 717, fonts.bold, 8.5, pillColor);
  }

  private drawPackageCard(
    page: PDFPage,
    fonts: Fonts,
    data: {
      x: number;
      y: number;
      width: number;
      height: number;
      packageName: string;
      packageDescription: string;
      productType: string;
      providerProductId: string;
      basePriceEur: number;
      order: StoreOrder;
    },
  ): void {
    this.drawCard(page, data.x, data.y, data.width, data.height);

    this.drawText(
      page,
      'PURCHASED PACKAGE',
      data.x + 16,
      data.y - 20,
      fonts.bold,
      9,
      COLORS.primary,
    );

    this.drawWrappedText(
      page,
      data.packageName,
      data.x + 16,
      data.y - 43,
      305,
      fonts.bold,
      14,
      16,
      COLORS.text,
      2,
    );

    if (data.packageDescription) {
      this.drawWrappedText(
        page,
        data.packageDescription,
        data.x + 16,
        data.y - 76,
        315,
        fonts.regular,
        8.8,
        11,
        COLORS.muted,
        2,
      );
    }

    const chipLabels = this.getPackageBenefitRows(data.order);

    let chipX = data.x + 16;
    let chipY = data.y - 107;

    for (const label of chipLabels.slice(0, 4)) {
      const text = this.safePdfText(label);
      const chipWidth = Math.min(
        fonts.bold.widthOfTextAtSize(text, 7.8) + 16,
        118,
      );

      page.drawRectangle({
        x: chipX,
        y: chipY,
        width: chipWidth,
        height: 16,
        color: COLORS.primarySoft,
        borderColor: COLORS.border,
        borderWidth: 0.5,
      });

      this.drawText(
        page,
        text,
        chipX + 7,
        chipY + 5,
        fonts.bold,
        7.8,
        COLORS.primary,
      );

      chipX += chipWidth + 7;

      if (chipX > data.x + 315) {
        chipX = data.x + 16;
        chipY -= 20;
      }
    }

    const rightX = data.x + 350;

    this.drawText(
      page,
      'Package Type',
      rightX,
      data.y - 43,
      fonts.bold,
      8.8,
      COLORS.muted,
    );
    this.drawText(
      page,
      data.productType,
      rightX,
      data.y - 58,
      fonts.bold,
      10,
      COLORS.text,
    );

    this.drawText(
      page,
      'Provider Product ID',
      rightX,
      data.y - 82,
      fonts.bold,
      8.8,
      COLORS.muted,
    );

    this.drawWrappedText(
      page,
      data.providerProductId,
      rightX,
      data.y - 97,
      150,
      fonts.regular,
      8.6,
      10,
      COLORS.text,
      2,
    );

    this.drawRightText(
      page,
      this.formatCurrencyAmount(data.basePriceEur, 'EUR'),
      data.x + data.width - 16,
      data.y - 43,
      fonts.bold,
      13,
      COLORS.primary,
    );
  }

  private drawInfoCard(
    page: PDFPage,
    fonts: Fonts,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    rows: InvoiceRow[],
  ): void {
    this.drawCard(page, x, y, width, height);

    this.drawText(page, title, x + 14, y - 18, fonts.bold, 8.8, COLORS.primary);

    let cursorY = y - 40;

    for (const row of rows) {
      this.drawText(
        page,
        row.label,
        x + 14,
        cursorY,
        fonts.regular,
        8.5,
        COLORS.muted,
      );

      this.drawWrappedRightText(
        page,
        this.toDisplayValue(row.value),
        x + width - 14,
        cursorY,
        width - 105,
        fonts.bold,
        8.7,
        COLORS.text,
      );

      cursorY -= 17;
    }
  }

  private drawSummaryCard(
    page: PDFPage,
    fonts: Fonts,
    data: {
      x: number;
      y: number;
      width: number;
      basePriceEur: number;
      discountPercentage: number;
      discountAmountEur: number;
      couponCode: string;
      configuredPayableEur: number;
      paidAmount: number;
      currency: string;
      isRefunded: boolean;
    },
  ): void {
    const height = 144;

    page.drawRectangle({
      x: data.x,
      y: data.y - height,
      width: data.width,
      height,
      color: COLORS.primarySoft,
      borderColor: COLORS.border,
      borderWidth: 1,
    });

    this.drawText(
      page,
      'PAYMENT SUMMARY',
      data.x + 14,
      data.y - 20,
      fonts.bold,
      9,
      COLORS.primary,
    );

    let y = data.y - 45;

    this.drawSummaryRow(
      page,
      fonts,
      data.x + 14,
      y,
      data.width - 28,
      'Package Price',
      this.formatCurrencyAmount(data.basePriceEur, 'EUR'),
    );

    y -= 20;

    if (data.discountPercentage > 0 || data.discountAmountEur > 0) {
      const couponLabel = data.couponCode
        ? `Coupon (${data.couponCode}) - ${data.discountPercentage}%`
        : `Coupon - ${data.discountPercentage}%`;

      this.drawSummaryRow(
        page,
        fonts,
        data.x + 14,
        y,
        data.width - 28,
        couponLabel,
        `-${this.formatCurrencyAmount(data.discountAmountEur, 'EUR')}`,
        COLORS.success,
      );

      y -= 20;
    }

    this.drawSummaryRow(
      page,
      fonts,
      data.x + 14,
      y,
      data.width - 28,
      'Configured Payable',
      this.formatCurrencyAmount(data.configuredPayableEur, 'EUR'),
    );

    y -= 20;

    this.drawSummaryRow(
      page,
      fonts,
      data.x + 14,
      y,
      data.width - 28,
      'Tax / VAT',
      'Handled by store',
      COLORS.muted,
    );

    y -= 26;

    page.drawLine({
      start: { x: data.x + 14, y },
      end: { x: data.x + data.width - 14, y },
      thickness: 1.2,
      color: COLORS.primary,
      opacity: 0.6,
    });

    y -= 22;

    this.drawText(
      page,
      data.isRefunded ? 'Refunded Amount' : 'Total Amount Paid',
      data.x + 14,
      y,
      fonts.bold,
      10.5,
      COLORS.primary,
    );

    this.drawRightText(
      page,
      this.formatCurrencyAmount(data.paidAmount, data.currency),
      data.x + data.width - 14,
      y,
      fonts.bold,
      14,
      COLORS.primary,
    );
  }

  private drawNoteCard(
    page: PDFPage,
    fonts: Fonts,
    x: number,
    y: number,
    width: number,
    height: number,
    title: string,
    text: string,
  ): void {
    page.drawRectangle({
      x,
      y: y - height,
      width,
      height,
      color: COLORS.warningBg,
      borderColor: rgb(245 / 255, 223 / 255, 141 / 255),
      borderWidth: 1,
    });

    this.drawText(
      page,
      title,
      x + 14,
      y - 20,
      fonts.bold,
      8.5,
      COLORS.warningText,
    );

    this.drawWrappedText(
      page,
      text,
      x + 14,
      y - 42,
      width - 28,
      fonts.regular,
      8.6,
      11,
      COLORS.warningText,
      7,
    );
  }

  private drawFooter(page: PDFPage, fonts: Fonts): void {
    const y = 56;

    page.drawLine({
      start: { x: PAGE.margin, y: y + 20 },
      end: { x: PAGE.width - PAGE.margin, y: y + 20 },
      thickness: 1,
      color: COLORS.border,
    });

    const supportEmail =
      this.config.get<string>('ITALIR_POTHE_INVOICE_SUPPORT_EMAIL') ||
      this.config.get<string>('SES_FROM_EMAIL') ||
      'support@italirpothe.com';

    this.drawWrappedText(
      page,
      `This invoice was generated automatically by Italir Pothe. For Google Play or App Store purchases, the official store receipt may include local tax, VAT, currency conversion, or regional pricing details. Support: ${supportEmail}`,
      PAGE.margin,
      y,
      PAGE.width - PAGE.margin * 2,
      fonts.regular,
      8,
      10,
      COLORS.muted,
      3,
    );
  }

  private drawSummaryRow(
    page: PDFPage,
    fonts: Fonts,
    x: number,
    y: number,
    width: number,
    label: string,
    value: string,
    valueColor = COLORS.text,
  ): void {
    this.drawText(page, label, x, y, fonts.regular, 8.8, COLORS.text);
    this.drawRightText(page, value, x + width, y, fonts.bold, 8.8, valueColor);
  }

  private drawCard(
    page: PDFPage,
    x: number,
    topY: number,
    width: number,
    height: number,
  ): void {
    page.drawRectangle({
      x,
      y: topY - height,
      width,
      height,
      color: COLORS.white,
      borderColor: COLORS.border,
      borderWidth: 1,
    });
  }

  private drawImageContain(
    page: PDFPage,
    image: PDFImage,
    options: {
      x: number;
      y: number;
      maxWidth: number;
      maxHeight: number;
      opacity?: number;
    },
  ): void {
    const scale = Math.min(
      options.maxWidth / image.width,
      options.maxHeight / image.height,
    );

    const width = image.width * scale;
    const height = image.height * scale;

    page.drawImage(image, {
      x: options.x + (options.maxWidth - width) / 2,
      y: options.y + (options.maxHeight - height) / 2,
      width,
      height,
      opacity: options.opacity,
    });
  }

  private drawText(
    page: PDFPage,
    text: string | number | null | undefined,
    x: number,
    y: number,
    font: PDFFont,
    size: number,
    color = COLORS.text,
  ): void {
    page.drawText(this.safePdfText(this.toDisplayValue(text)), {
      x,
      y,
      font,
      size,
      color,
    });
  }

  private drawRightText(
    page: PDFPage,
    text: string | number | null | undefined,
    rightX: number,
    y: number,
    font: PDFFont,
    size: number,
    color = COLORS.text,
  ): void {
    const safeText = this.safePdfText(this.toDisplayValue(text));
    const width = font.widthOfTextAtSize(safeText, size);

    page.drawText(safeText, {
      x: rightX - width,
      y,
      font,
      size,
      color,
    });
  }

  private drawWrappedRightText(
    page: PDFPage,
    text: string | number | null | undefined,
    rightX: number,
    y: number,
    maxWidth: number,
    font: PDFFont,
    size: number,
    color = COLORS.text,
  ): void {
    const safeText = this.safePdfText(this.toDisplayValue(text));
    let finalText = safeText;

    while (
      finalText.length > 3 &&
      font.widthOfTextAtSize(finalText, size) > maxWidth
    ) {
      finalText = `${finalText.slice(0, -4)}...`;
    }

    this.drawRightText(page, finalText, rightX, y, font, size, color);
  }

  private drawWrappedText(
    page: PDFPage,
    text: string | number | null | undefined,
    x: number,
    topY: number,
    maxWidth: number,
    font: PDFFont,
    size: number,
    lineHeight: number,
    color = COLORS.text,
    maxLines?: number,
  ): number {
    const safeText = this.safePdfText(this.toDisplayValue(text));
    const words = safeText.split(/\s+/).filter(Boolean);

    const lines: string[] = [];
    let current = '';

    for (const word of words) {
      const next = current ? `${current} ${word}` : word;

      if (font.widthOfTextAtSize(next, size) <= maxWidth) {
        current = next;
        continue;
      }

      if (current) {
        lines.push(current);
      }

      current = word;
    }

    if (current) {
      lines.push(current);
    }

    const finalLines =
      typeof maxLines === 'number' ? lines.slice(0, maxLines) : lines;

    finalLines.forEach((line, index) => {
      page.drawText(line, {
        x,
        y: topY - index * lineHeight,
        font,
        size,
        color,
      });
    });

    return finalLines.length;
  }

  private getPackageBenefitRows(order: StoreOrder): string[] {
    const snapshot = (order as any).snapshot;

    if (!snapshot) {
      return [];
    }

    const rows: string[] = [];

    if (snapshot.voiceMinutes !== null && snapshot.voiceMinutes !== undefined) {
      rows.push(`${snapshot.voiceMinutes} voice minutes`);
    }

    if (snapshot.textTokens !== null && snapshot.textTokens !== undefined) {
      rows.push(`${snapshot.textTokens} text tokens`);
    }

    if (snapshot.freezeCount !== null && snapshot.freezeCount !== undefined) {
      rows.push(`${snapshot.freezeCount} streak freezer`);
    }

    if (
      snapshot.cvCreditCount !== null &&
      snapshot.cvCreditCount !== undefined
    ) {
      rows.push(`${snapshot.cvCreditCount} CV credits`);
    }

    if (
      snapshot.protectionDurationDays !== null &&
      snapshot.protectionDurationDays !== undefined
    ) {
      rows.push(`${snapshot.protectionDurationDays} days protection`);
    }

    if (snapshot.streakProtectionMode) {
      rows.push(this.toTitleLabel(snapshot.streakProtectionMode));
    }

    if (snapshot.billingModel) {
      rows.push(this.toTitleLabel(snapshot.billingModel));
    }

    if (snapshot.marketingBadge) {
      rows.push(this.toTitleLabel(snapshot.marketingBadge));
    }

    return rows.filter(Boolean);
  }

  private pickValue(source: any, paths: string[]): unknown {
    for (const path of paths) {
      const value = path.split('.').reduce((current, key) => {
        if (current === null || current === undefined) {
          return undefined;
        }

        return current[key];
      }, source);

      if (value !== null && value !== undefined && value !== '') {
        return value;
      }
    }

    return null;
  }

  private pickString(source: any, paths: string[], fallback: string): string {
    const value = this.pickValue(source, paths);

    if (value === null || value === undefined || value === '') {
      return fallback;
    }

    return String(value);
  }

  private pickNumber(source: any, paths: string[]): number {
    const value = this.pickValue(source, paths);

    if (typeof value === 'number') {
      return Number.isFinite(value) ? value : 0;
    }

    const parsed = Number.parseFloat(String(value ?? '0'));

    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatCurrencyAmount(
    value: string | number | null | undefined,
    currency = 'EUR',
  ): string {
    const parsed =
      typeof value === 'number' ? value : Number.parseFloat(value ?? '0');

    const amount = Number.isFinite(parsed) ? parsed : 0;
    const safeCurrency = String(currency || 'EUR').toUpperCase();

    if (safeCurrency === 'BDT') {
      return `BDT ${amount.toFixed(0)}`;
    }

    if (safeCurrency === 'EUR') {
      return `EUR ${amount.toFixed(2)}`;
    }

    if (safeCurrency === 'USD') {
      return `USD ${amount.toFixed(2)}`;
    }

    return `${safeCurrency} ${amount.toFixed(2)}`;
  }

  private formatDateTime(value: Date | string | null | undefined): string {
    if (!value) {
      return '-';
    }

    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) {
      return '-';
    }

    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  }

  private toTitleLabel(value: string | null | undefined): string {
    if (!value || value === '-') {
      return '-';
    }

    return String(value)
      .replace(/[_-]+/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private safeFileName(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]+/g, '-');
  }

  private toDisplayValue(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '-';
    }

    return String(value);
  }

  private safePdfText(value: string): string {
    return String(value)
      .replace(/[–—]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[^\x20-\x7E]/g, '?');
  }
}
