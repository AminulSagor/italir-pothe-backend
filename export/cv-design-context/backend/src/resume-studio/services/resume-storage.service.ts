import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { CloudFrontSignerService } from '../../files/services/cloudfront-signer.service';
import { S3Service } from '../../files/services/s3.service';

@Injectable()
export class ResumeStorageService {
  constructor(
    private readonly s3Service: S3Service,
    private readonly cloudFrontSignerService: CloudFrontSignerService,
  ) {}

  /**
   * Keep exactly one generated PDF object per Resume Studio document.
   * Edits overwrite this stable key instead of creating an unbounded number
   * of content-hash objects in S3. The database still stores the current hash
   * for render caching and diagnostics.
   */
  async storeGeneratedPdf(params: {
    userId: string;
    documentId: string;
    buffer: Buffer;
  }): Promise<string> {
    const storageKey = [
      'resume-studio',
      'generated',
      params.userId,
      params.documentId,
      'latest.pdf',
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

  async signedTemplatePdf(storageKey: string, fileName: string) {
    return this.signedTemplateAsset({
      storageKey,
      mimeType: 'application/pdf',
      originalName: fileName,
    });
  }

  async signedImage(storageKey: string) {
    return this.signedTemplateAsset({
      storageKey,
      mimeType: 'image/png',
      originalName: 'resume-template-preview.png',
    });
  }

  private async signedTemplateAsset(params: {
    storageKey: string;
    mimeType: string;
    originalName: string;
  }): Promise<string> {
    const cloudFrontAccess =
      this.cloudFrontSignerService.createSignedUrlForFile(params.storageKey);

    if (cloudFrontAccess) {
      return cloudFrontAccess.signedUrl;
    }

    return this.s3Service.createSignedReadUrl({
      ...params,
      dispositionType: 'inline',
    });
  }

  async exists(storageKey: string): Promise<boolean> {
    return this.s3Service.objectExists(storageKey);
  }
}
