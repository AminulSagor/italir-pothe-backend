import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { S3Service } from '../../files/services/s3.service';

@Injectable()
export class ResumeStorageService {
  constructor(private readonly s3Service: S3Service) {}

  async storeGeneratedPdf(params: {
    userId: string;
    documentId: string;
    contentHash: string;
    buffer: Buffer;
  }): Promise<string> {
    const storageKey = [
      'resume-studio',
      'generated',
      params.userId,
      params.documentId,
      `${params.contentHash}.pdf`,
    ].join('/');
    await this.s3Service.uploadBuffer({
      storageKey,
      buffer: params.buffer,
      mimeType: 'application/pdf',
    });
    return storageKey;
  }

  async storeTemplatePreview(params: {
    templateId: string;
    versionNumber: number;
    pdfBuffer: Buffer;
    imageBuffer: Buffer;
  }): Promise<{ pdfStorageKey: string; imageStorageKey: string }> {
    const prefix = `resume-studio/templates/${params.templateId}/v${params.versionNumber}`;
    const pdfStorageKey = `${prefix}/preview.pdf`;
    const imageStorageKey = `${prefix}/preview-${randomUUID()}.png`;

    await Promise.all([
      this.s3Service.uploadBuffer({
        storageKey: pdfStorageKey,
        buffer: params.pdfBuffer,
        mimeType: 'application/pdf',
      }),
      this.s3Service.uploadBuffer({
        storageKey: imageStorageKey,
        buffer: params.imageBuffer,
        mimeType: 'image/png',
      }),
    ]);

    return { pdfStorageKey, imageStorageKey };
  }

  async signedPdf(storageKey: string, fileName: string) {
    return this.s3Service.createSignedReadUrl({
      storageKey,
      mimeType: 'application/pdf',
      originalName: fileName,
      dispositionType: 'inline',
    });
  }

  async signedImage(storageKey: string) {
    return this.s3Service.createSignedReadUrl({
      storageKey,
      mimeType: 'image/png',
      originalName: 'resume-template-preview.png',
      dispositionType: 'inline',
    });
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.s3Service.objectExists(storageKey);
  }
}
