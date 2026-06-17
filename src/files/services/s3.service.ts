import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { extname } from 'path';

import { FilePurpose } from '../entities/file.entity';

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly publicBaseUrl?: string;
  private readonly uploadUrlExpiresInSeconds = 15 * 60;
  private readonly readUrlExpiresInSeconds = 15 * 60;

  constructor(private readonly configService: ConfigService) {
    const region =
      this.configService.get<string>('AWS_S3_REGION') ??
      this.configService.get<string>('AWS_REGION') ??
      'ap-south-1';

    const bucketName = this.configService.get<string>('AWS_S3_BUCKET');

    if (!bucketName) {
      throw new InternalServerErrorException('AWS_S3_BUCKET is not configured');
    }

    this.bucketName = bucketName;
    this.region = region;
    this.publicBaseUrl = this.configService.get<string>(
      'AWS_S3_PUBLIC_BASE_URL',
    );

    const accessKeyId =
      this.configService.get<string>('AWS_ACCESS_KEY_ID') ??
      this.configService.get<string>('AWS_ACCESS_KEY_ID');

    const secretAccessKey =
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY') ??
      this.configService.get<string>('AWS_SECRET_ACCESS_KEY');

    this.s3Client = new S3Client({
      region,
      credentials:
        accessKeyId && secretAccessKey
          ? {
              accessKeyId,
              secretAccessKey,
            }
          : undefined,
    });
  }

  createStorageKey(filePurpose: FilePurpose, originalName: string): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const extension = this.getSafeExtension(originalName);

    return `italir-pothe/${filePurpose}/${year}/${month}/${randomUUID()}.${extension}`;
  }

  async createSignedUploadUrl(params: {
    storageKey: string;
    mimeType: string;
  }): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: params.storageKey,
      ContentType: params.mimeType,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: this.uploadUrlExpiresInSeconds,
    });
  }

  async uploadBuffer(params: {
    storageKey: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<void> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: params.storageKey,
        Body: params.buffer,
        ContentType: params.mimeType,
      });

      await this.s3Client.send(command);
    } catch (err) {
      throw new InternalServerErrorException('Failed to upload object to S3');
    }
  }

createPublicUrl(storageKey: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`;
    }

    return `https://${this.bucketName}.s3.${this.region}.amazonaws.com/${storageKey}`;
  }

  async createSignedReadUrl(params: {
    storageKey: string;
    mimeType: string;
    originalName: string;
    dispositionType?: 'inline' | 'attachment';
  }): Promise<string> {
    const safeFileName = this.sanitizeFileName(params.originalName);
    const dispositionType = params.dispositionType ?? 'inline';

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: params.storageKey,
      ResponseContentType: params.mimeType,
      ResponseContentDisposition: `${dispositionType}; filename="${safeFileName}"`,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: this.readUrlExpiresInSeconds,
    });
  }

  async assertObjectExists(storageKey: string): Promise<void> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: storageKey,
      });

      await this.s3Client.send(command);
    } catch {
      throw new NotFoundException(
        'Uploaded file was not found in S3. Please upload the file before confirming.',
      );
    }
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/["\\]/g, '')
      .replace(/[\r\n]/g, '')
      .trim();
  }

  getUploadUrlExpiresInSeconds(): number {
    return this.uploadUrlExpiresInSeconds;
  }

  getReadUrlExpiresInSeconds(): number {
    return this.readUrlExpiresInSeconds;
  }

  private getSafeExtension(originalName: string): string {
    const extension = extname(originalName).replace('.', '').toLowerCase();

    if (/^[a-z0-9]{1,10}$/.test(extension)) {
      return extension;
    }

    return 'bin';
  }
}
