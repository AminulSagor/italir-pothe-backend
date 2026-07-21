import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

import { AiContentReportsService } from './ai-content-reports.service';
import { CreateAiContentReportDto } from './dto/create-ai-content-report.dto';

interface UploadedScreenshot {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
}

@Controller('api/v1/ai-content-reports')
@UseGuards(JwtAuthGuard)
export class AiContentReportsController {
  constructor(
    private readonly aiContentReportsService: AiContentReportsService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('screenshot', {
      storage: memoryStorage(),
      limits: {
        fileSize: 5 * 1024 * 1024,
      },
      fileFilter: (_request, file, callback) => {
        const allowedMimeTypes = [
          'image/jpeg',
          'image/png',
          'image/webp',
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
          return callback(
            new BadRequestException(
              'Screenshot must be JPEG, PNG, or WEBP.',
            ),
            false,
          );
        }

        callback(null, true);
      },
    }),
  )
  async createReport(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAiContentReportDto,
    @UploadedFile() screenshot?: UploadedScreenshot,
  ) {
    const reporterId = request.user?.id ?? request.user?.sub;

    if (!reporterId) {
      throw new BadRequestException('Authenticated reporter is required.');
    }

    const result = await this.aiContentReportsService.createReport(
      {
        id: reporterId,
        role: request.user?.role,
      },
      dto,
      screenshot
        ? {
            buffer: screenshot.buffer,
            originalName: screenshot.originalname,
            mimeType: screenshot.mimetype,
          }
        : null,
    );

    return {
      success: true,
      data: result,
    };
  }
}
