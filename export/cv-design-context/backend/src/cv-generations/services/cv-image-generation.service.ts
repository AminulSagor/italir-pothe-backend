import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { toFile } from 'openai';

type CvImageSize = '1024x1024' | '1024x1536' | '1536x1024' | 'auto';

type CvImageQuality = 'low' | 'medium' | 'high' | 'auto';

export interface CvReferenceImage {
  url: string;
  fileName: string;
}

interface DownloadedImage {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
}

@Injectable()
export class CvImageGenerationService {
  private readonly logger = new Logger(CvImageGenerationService.name);

  private readonly openai: OpenAI | null;
  private readonly imageSize: CvImageSize;
  private readonly imageQuality: CvImageQuality;
  private readonly downloadTimeoutMs: number;
  private readonly maxReferenceImageBytes = 20 * 1024 * 1024;

  constructor(private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();

    const requestTimeoutMs = this.parsePositiveNumber(
      this.configService.get<string>('OPENAI_CV_REQUEST_TIMEOUT_MS'),
      180_000,
    );

    this.downloadTimeoutMs = this.parsePositiveNumber(
      this.configService.get<string>('OPENAI_CV_DOWNLOAD_TIMEOUT_MS'),
      30_000,
    );

    this.imageSize = this.parseImageSize(
      this.configService.get<string>('OPENAI_CV_IMAGE_SIZE'),
    );

    this.imageQuality = this.parseImageQuality(
      this.configService.get<string>('OPENAI_CV_IMAGE_QUALITY'),
    );

    this.openai = apiKey
      ? new OpenAI({
          apiKey,
          timeout: requestTimeoutMs,
          maxRetries: 2,
        })
      : null;
  }

  async generateFromScratch(prompt: string): Promise<Buffer> {
    const openai = this.getOpenAIClient();

    try {
      const response = await openai.images.generate({
        model: 'gpt-image-2',
        prompt,
        size: this.imageSize,
        quality: this.imageQuality,
        n: 1,
        output_format: 'jpeg',
        output_compression: 90,
      });

      return this.extractImageBuffer(response.data?.[0]?.b64_json);
    } catch (error) {
      this.logOpenAIError(error);

      throw new ServiceUnavailableException(
        'The CV image could not be generated. Please try again.',
      );
    }
  }

  async generateFromReferences(
    prompt: string,
    references: CvReferenceImage[],
  ): Promise<Buffer> {
    if (references.length === 0) {
      return this.generateFromScratch(prompt);
    }

    const openai = this.getOpenAIClient();

    try {
      const downloadedImages = await Promise.all(
        references.map((reference) => this.downloadImage(reference)),
      );

      const uploadableImages = await Promise.all(
        downloadedImages.map((image) =>
          toFile(image.buffer, image.fileName, {
            type: image.mimeType,
          }),
        ),
      );

      const response = await openai.images.edit({
        model: 'gpt-image-2',
        image: uploadableImages,
        prompt,
        size: this.imageSize,
        quality: this.imageQuality,
        output_format: 'jpeg',
        output_compression: 90,
      });

      return this.extractImageBuffer(response.data?.[0]?.b64_json);
    } catch (error) {
      this.logOpenAIError(error);

      throw new ServiceUnavailableException(
        'The CV image could not be generated from the selected references.',
      );
    }
  }

  private getOpenAIClient(): OpenAI {
    if (!this.openai) {
      throw new ServiceUnavailableException(
        'OPENAI_API_KEY is not configured.',
      );
    }

    return this.openai;
  }

  private async downloadImage(
    reference: CvReferenceImage,
  ): Promise<DownloadedImage> {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(reference.url);
    } catch {
      throw new BadRequestException('A CV reference image URL is invalid.');
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
      throw new BadRequestException(
        'CV reference images must use HTTP or HTTPS.',
      );
    }

    const controller = new AbortController();

    const timeout = setTimeout(() => {
      controller.abort();
    }, this.downloadTimeoutMs);

    try {
      const response = await fetch(reference.url, {
        method: 'GET',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new BadRequestException(
          `Reference image could not be loaded: HTTP ${response.status}.`,
        );
      }

      const contentLength = Number(response.headers.get('content-length') ?? 0);

      if (
        Number.isFinite(contentLength) &&
        contentLength > this.maxReferenceImageBytes
      ) {
        throw new BadRequestException(
          'A reference image exceeds the 20 MB limit.',
        );
      }

      const mimeType = this.normalizeImageMimeType(
        response.headers.get('content-type'),
        reference.fileName,
      );

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0) {
        throw new BadRequestException('A reference image is empty.');
      }

      if (buffer.length > this.maxReferenceImageBytes) {
        throw new BadRequestException(
          'A reference image exceeds the 20 MB limit.',
        );
      }

      return {
        buffer,
        mimeType,
        fileName: this.ensureFileExtension(reference.fileName, mimeType),
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new ServiceUnavailableException(
          'A CV reference image download timed out.',
        );
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeImageMimeType(
    contentType: string | null,
    fileName: string,
  ): string {
    const normalizedContentType = contentType
      ?.split(';')[0]
      .trim()
      .toLowerCase();

    const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

    if (normalizedContentType && allowedMimeTypes.has(normalizedContentType)) {
      return normalizedContentType;
    }

    const normalizedFileName = fileName.toLowerCase();

    if (
      normalizedFileName.endsWith('.jpg') ||
      normalizedFileName.endsWith('.jpeg')
    ) {
      return 'image/jpeg';
    }

    if (normalizedFileName.endsWith('.png')) {
      return 'image/png';
    }

    if (normalizedFileName.endsWith('.webp')) {
      return 'image/webp';
    }

    throw new BadRequestException(
      'Only JPEG, PNG and WebP reference images are supported.',
    );
  }

  private ensureFileExtension(fileName: string, mimeType: string): string {
    const normalizedFileName = fileName.trim() || 'reference-image';

    if (/\.(jpg|jpeg|png|webp)$/i.test(normalizedFileName)) {
      return normalizedFileName;
    }

    const extension =
      mimeType === 'image/png'
        ? 'png'
        : mimeType === 'image/webp'
          ? 'webp'
          : 'jpg';

    return `${normalizedFileName}.${extension}`;
  }

  private extractImageBuffer(encodedImage: string | undefined): Buffer {
    if (!encodedImage) {
      throw new ServiceUnavailableException(
        'OpenAI did not return generated image data.',
      );
    }

    const buffer = Buffer.from(encodedImage, 'base64');

    if (buffer.length === 0) {
      throw new ServiceUnavailableException(
        'OpenAI returned an empty generated image.',
      );
    }

    return buffer;
  }

  private parseImageSize(configuredValue: string | undefined): CvImageSize {
    const allowedValues = new Set<CvImageSize>([
      '1024x1024',
      '1024x1536',
      '1536x1024',
      'auto',
    ]);

    const normalizedValue = configuredValue?.trim() as CvImageSize | undefined;

    return normalizedValue && allowedValues.has(normalizedValue)
      ? normalizedValue
      : '1024x1536';
  }

  private parseImageQuality(
    configuredValue: string | undefined,
  ): CvImageQuality {
    const allowedValues = new Set<CvImageQuality>([
      'low',
      'medium',
      'high',
      'auto',
    ]);

    const normalizedValue = configuredValue?.trim() as
      | CvImageQuality
      | undefined;

    return normalizedValue && allowedValues.has(normalizedValue)
      ? normalizedValue
      : 'medium';
  }

  private parsePositiveNumber(
    value: string | undefined,
    fallback: number,
  ): number {
    const parsedValue = Number(value);

    return Number.isFinite(parsedValue) && parsedValue > 0
      ? parsedValue
      : fallback;
  }

  private logOpenAIError(error: unknown): void {
    if (error instanceof Error) {
      this.logger.error(
        `OpenAI CV generation failed: ${error.name}: ${error.message}`,
      );

      return;
    }

    this.logger.error('OpenAI CV generation failed.');
  }
}
