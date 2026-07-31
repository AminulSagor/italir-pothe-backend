import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { randomUUID } from 'node:crypto';
import {
  createReadStream,
  createWriteStream,
  promises as fileSystem,
} from 'node:fs';
import { extname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import { FilePurpose } from '../entities/file.entity';

export interface S3ObjectMetadata {
  contentLength: number;
  contentType: string | null;
  eTag: string | null;
}

@Injectable()
export class S3Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly region: string;
  private readonly publicBaseUrl?: string;
  private readonly cloudFrontBaseUrl?: string;

  private readonly uploadUrlExpiresInSeconds: number;
  private readonly readUrlExpiresInSeconds: number;
  private readonly multipartUrlExpiresInSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.region =
      this.configService.get<string>('AWS_S3_REGION')?.trim() ||
      this.configService.get<string>('AWS_REGION')?.trim() ||
      'eu-north-1';

    const bucketName = this.configService.get<string>('AWS_S3_BUCKET')?.trim();

    if (!bucketName) {
      throw new InternalServerErrorException('AWS_S3_BUCKET is not configured');
    }

    this.bucketName = bucketName;

    this.publicBaseUrl = this.configService
      .get<string>('AWS_S3_PUBLIC_BASE_URL')
      ?.trim();

    this.cloudFrontBaseUrl = this.configService
      .get<string>('AWS_CLOUDFRONT_BASE_URL')
      ?.trim();

    this.uploadUrlExpiresInSeconds = this.getPositiveInteger(
      'AWS_S3_UPLOAD_URL_EXPIRES_SECONDS',
      3600,
    );

    this.readUrlExpiresInSeconds = this.getPositiveInteger(
      'AWS_S3_READ_URL_EXPIRES_SECONDS',
      3600,
    );

    this.multipartUrlExpiresInSeconds = this.getPositiveInteger(
      'S3_MULTIPART_URL_EXPIRES_SECONDS',
      1800,
    );

    const accessKeyId = this.configService
      .get<string>('AWS_ACCESS_KEY_ID')
      ?.trim();

    const secretAccessKey = this.configService
      .get<string>('AWS_SECRET_ACCESS_KEY')
      ?.trim();

    this.s3Client = new S3Client({
      region: this.region,
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

    return [
      'italir-pothe',
      filePurpose,
      String(year),
      month,
      `${randomUUID()}.${extension}`,
    ].join('/');
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

  async initiateMultipartUpload(params: {
    storageKey: string;
    mimeType: string;
    expectedSizeBytes: number;
  }): Promise<string> {
    const result = await this.s3Client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: params.storageKey,
        ContentType: params.mimeType,
        Metadata: {
          expectedsizebytes: String(params.expectedSizeBytes),
        },
      }),
    );

    if (!result.UploadId) {
      throw new InternalServerErrorException(
        'S3 did not return a multipart upload ID.',
      );
    }

    return result.UploadId;
  }

  async createSignedMultipartPartUrl(params: {
    storageKey: string;
    uploadId: string;
    partNumber: number;
  }): Promise<string> {
    const command = new UploadPartCommand({
      Bucket: this.bucketName,
      Key: params.storageKey,
      UploadId: params.uploadId,
      PartNumber: params.partNumber,
    });

    return getSignedUrl(this.s3Client, command, {
      expiresIn: this.multipartUrlExpiresInSeconds,
    });
  }

  async completeMultipartUpload(params: {
    storageKey: string;
    uploadId: string;
    parts: Array<{
      partNumber: number;
      eTag: string;
    }>;
  }): Promise<void> {
    await this.s3Client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: params.storageKey,
        UploadId: params.uploadId,
        MultipartUpload: {
          Parts: params.parts
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((part) => ({
              PartNumber: part.partNumber,
              ETag: part.eTag,
            })),
        },
      }),
    );
  }

  async abortMultipartUpload(params: {
    storageKey: string;
    uploadId: string;
  }): Promise<void> {
    await this.s3Client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.bucketName,
        Key: params.storageKey,
        UploadId: params.uploadId,
      }),
    );
  }

  async uploadBuffer(params: {
    storageKey: string;
    buffer: Buffer;
    mimeType: string;
  }): Promise<void> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: params.storageKey,
          Body: params.buffer,
          ContentType: params.mimeType,
        }),
      );
    } catch {
      throw new InternalServerErrorException('Failed to upload object to S3');
    }
  }

  async uploadLocalFile(params: {
    storageKey: string;
    localPath: string;
    mimeType: string;
    cacheControl?: string;
  }): Promise<void> {
    const fileStats = await fileSystem.stat(params.localPath);

    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: params.storageKey,
        Body: createReadStream(params.localPath),
        ContentLength: fileStats.size,
        ContentType: params.mimeType,
        CacheControl: params.cacheControl,
      }),
    );
  }

  async downloadObjectToFile(params: {
    storageKey: string;
    destinationPath: string;
  }): Promise<void> {
    const result = await this.s3Client.send(
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: params.storageKey,
      }),
    );

    if (!result.Body || !(result.Body instanceof Readable)) {
      throw new InternalServerErrorException(
        'S3 object body is not a readable stream.',
      );
    }

    await pipeline(result.Body, createWriteStream(params.destinationPath));
  }

  async getObjectMetadata(storageKey: string): Promise<S3ObjectMetadata> {
    try {
      const result = await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      );

      return {
        contentLength: Number(result.ContentLength ?? 0),
        contentType: result.ContentType ?? null,
        eTag: result.ETag ?? null,
      };
    } catch {
      throw new NotFoundException('Uploaded file was not found in S3.');
    }
  }

  async objectExists(storageKey: string): Promise<boolean> {
    try {
      await this.s3Client.send(
        new HeadObjectCommand({
          Bucket: this.bucketName,
          Key: storageKey,
        }),
      );

      return true;
    } catch {
      return false;
    }
  }

  async assertObjectMatches(params: {
    storageKey: string;
    expectedSizeBytes: number;
    expectedMimeType: string;
  }): Promise<S3ObjectMetadata> {
    const metadata = await this.getObjectMetadata(params.storageKey);

    if (metadata.contentLength !== params.expectedSizeBytes) {
      throw new InternalServerErrorException(
        `S3 object size mismatch. Expected ${params.expectedSizeBytes} bytes but received ${metadata.contentLength} bytes.`,
      );
    }

    const actualMimeType = metadata.contentType
      ?.split(';')[0]
      .trim()
      .toLowerCase();

    const expectedMimeType = params.expectedMimeType
      .split(';')[0]
      .trim()
      .toLowerCase();

    if (actualMimeType && actualMimeType !== expectedMimeType) {
      throw new InternalServerErrorException(
        `S3 object content type mismatch. Expected ${expectedMimeType} but received ${actualMimeType}.`,
      );
    }

    return metadata;
  }

  async assertObjectExists(storageKey: string): Promise<void> {
    await this.getObjectMetadata(storageKey);
  }

  async deletePrefix(prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const result = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );

      const objects =
        result.Contents?.flatMap((object) =>
          object.Key ? [{ Key: object.Key }] : [],
        ) ?? [];

      if (objects.length > 0) {
        await this.s3Client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucketName,
            Delete: {
              Objects: objects,
              Quiet: true,
            },
          }),
        );
      }

      continuationToken = result.IsTruncated
        ? result.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }

  createPublicUrl(storageKey: string): string {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${storageKey}`;
    }

    return [
      `https://${this.bucketName}.s3.${this.region}.amazonaws.com`,
      storageKey,
    ].join('/');
  }

  createCloudFrontUrl(storageKey: string): string {
    if (!this.cloudFrontBaseUrl) {
      throw new InternalServerErrorException(
        'AWS_CLOUDFRONT_BASE_URL is not configured.',
      );
    }

    return `${this.cloudFrontBaseUrl.replace(/\/$/, '')}/${storageKey}`;
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

  getUploadUrlExpiresInSeconds(): number {
    return this.uploadUrlExpiresInSeconds;
  }

  getReadUrlExpiresInSeconds(): number {
    return this.readUrlExpiresInSeconds;
  }

  getMultipartUrlExpiresInSeconds(): number {
    return this.multipartUrlExpiresInSeconds;
  }

  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/["\\]/g, '')
      .replace(/[\r\n]/g, '')
      .trim();
  }

  private getSafeExtension(originalName: string): string {
    const extension = extname(originalName).replace('.', '').toLowerCase();

    if (/^[a-z0-9]{1,10}$/.test(extension)) {
      return extension;
    }

    return 'bin';
  }

  private getPositiveInteger(
    environmentName: string,
    fallbackValue: number,
  ): number {
    const configuredValue = this.configService
      .get<string>(environmentName)
      ?.trim();

    if (!configuredValue) {
      return fallbackValue;
    }

    const parsedValue = Number(configuredValue);

    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
      throw new InternalServerErrorException(
        `${environmentName} must be a positive safe integer.`,
      );
    }

    return parsedValue;
  }
}
