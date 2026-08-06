import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument } from 'pdf-lib';

import { PdfProcessingStatus } from '../entities/file.entity';
import { S3Service } from './s3.service';

const execFileAsync = promisify(execFile);

export interface PdfProcessingResult {
  pageCount: number;
  sizeBytes: number;
  status: PdfProcessingStatus;
  linearized: boolean;
  processedAt: Date;
  error: string | null;
}

@Injectable()
export class PdfProcessingService {
  private readonly logger = new Logger(PdfProcessingService.name);
  private readonly linearizationEnabled: boolean;
  private readonly linearizationRequired: boolean;
  private readonly qpdfBinary: string;
  private readonly timeoutMs: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
  ) {
    this.linearizationEnabled = this.getBoolean(
      'PDF_LINEARIZATION_ENABLED',
      true,
    );
    this.linearizationRequired = this.getBoolean(
      'PDF_LINEARIZATION_REQUIRED',
      false,
    );
    this.qpdfBinary =
      this.configService.get<string>('QPDF_BINARY')?.trim() || 'qpdf';
    this.timeoutMs = this.getPositiveInteger(
      'PDF_LINEARIZATION_TIMEOUT_MS',
      60_000,
    );
  }

  async processUploadedPdf(storageKey: string): Promise<PdfProcessingResult> {
    const temporaryDirectory = await mkdtemp(join(tmpdir(), 'italir-pdf-'));
    const sourcePath = join(temporaryDirectory, 'source.pdf');
    const linearizedPath = join(temporaryDirectory, 'linearized.pdf');

    try {
      await this.s3Service.downloadObjectToFile({
        storageKey,
        destinationPath: sourcePath,
      });

      const sourceBuffer = await readFile(sourcePath);
      const pageCount = await this.readPageCount(sourceBuffer);
      const sourceStats = await stat(sourcePath);
      const processedAt = new Date();

      if (!this.linearizationEnabled) {
        return {
          pageCount,
          sizeBytes: sourceStats.size,
          status: PdfProcessingStatus.SKIPPED,
          linearized: false,
          processedAt,
          error: null,
        };
      }

      try {
        await execFileAsync(
          this.qpdfBinary,
          ['--linearize', sourcePath, linearizedPath],
          {
            timeout: this.timeoutMs,
            windowsHide: true,
          },
        );

        const linearizedStats = await stat(linearizedPath);

        if (linearizedStats.size <= 0) {
          throw new Error('qpdf produced an empty PDF.');
        }

        await this.s3Service.uploadLocalFile({
          storageKey,
          localPath: linearizedPath,
          mimeType: 'application/pdf',
        });

        return {
          pageCount,
          sizeBytes: linearizedStats.size,
          status: PdfProcessingStatus.READY,
          linearized: true,
          processedAt,
          error: null,
        };
      } catch (error) {
        const message = this.errorMessage(error);

        this.logger.warn(
          `PDF linearization failed for ${storageKey}: ${message}`,
        );

        if (this.linearizationRequired) {
          throw new InternalServerErrorException(
            'The PDF could not be optimized for web delivery.',
          );
        }

        return {
          pageCount,
          sizeBytes: sourceStats.size,
          status: PdfProcessingStatus.FAILED,
          linearized: false,
          processedAt,
          error: message,
        };
      }
    } finally {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    }
  }

  private async readPageCount(buffer: Buffer): Promise<number> {
    try {
      const document = await PDFDocument.load(buffer);
      const pageCount = document.getPageCount();

      if (!Number.isSafeInteger(pageCount) || pageCount <= 0) {
        throw new Error('The PDF does not contain any pages.');
      }

      return pageCount;
    } catch {
      throw new BadRequestException(
        'The uploaded PDF is invalid, encrypted, or cannot be processed.',
      );
    }
  }

  private getBoolean(environmentName: string, fallbackValue: boolean): boolean {
    const rawValue = this.configService
      .get<string>(environmentName)
      ?.trim()
      .toLowerCase();

    if (!rawValue) {
      return fallbackValue;
    }

    if (['true', '1', 'yes', 'on'].includes(rawValue)) {
      return true;
    }

    if (['false', '0', 'no', 'off'].includes(rawValue)) {
      return false;
    }

    throw new Error(`${environmentName} must be a boolean value.`);
  }

  private getPositiveInteger(
    environmentName: string,
    fallbackValue: number,
  ): number {
    const rawValue = this.configService.get<string>(environmentName)?.trim();

    if (!rawValue) {
      return fallbackValue;
    }

    const parsedValue = Number(rawValue);

    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
      throw new Error(`${environmentName} must be a positive integer.`);
    }

    return parsedValue;
  }

  private errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 2_000);
  }
}
