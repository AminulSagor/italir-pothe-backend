import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request } from 'express';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { UserReportsService } from './user-reports.service';

type AuthenticatedRequest = Request & { user: { id: string; role?: string } };

@Controller('user-reports')
@UseGuards(JwtAuthGuard)
export class UserReportsController {
  constructor(private readonly userReportsService: UserReportsService) {}

  @Get('reasons')
  async getReasons() {
    return this.userReportsService.listActiveReasons();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('evidenceImage', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
      fileFilter: (req, file, cb) => {
        const allowed = ['image/jpeg', 'image/png', 'image/webp'];
        if (!allowed.includes(file.mimetype)) {
          return cb(new BadRequestException('Unsupported file type'), false);
        }
        cb(null, true);
      },
    }),
  )
  async createReport(
    @Req() req: any,
    @Body('reportedUserId') reportedUserId: string,
    @Body('reasonId') reasonId: string,
    @Body('description') description?: string,
    @Body('clientReportId') clientReportId?: string,
    @Body('evidenceFileId') evidenceFileId?: string,
    @UploadedFile() evidenceImage?: any,
  ) {
    if (!reportedUserId) {
      throw new BadRequestException('reportedUserId is required');
    }

    if (!reasonId) {
      throw new BadRequestException('reasonId is required');
    }

    if (description && description.length > 500) {
      throw new BadRequestException('Description cannot exceed 500 characters');
    }

    const reporter = { id: req.user?.id, role: req.user?.role };

    const evidence = evidenceImage
      ? {
          buffer: evidenceImage.buffer,
          originalName: evidenceImage.originalname,
          mimeType: evidenceImage.mimetype,
        }
      : null;

    const result = await this.userReportsService.createReport(
      reporter,
      reportedUserId,
      reasonId,
      description,
      clientReportId,
      evidenceFileId,
      evidence,
    );

    return { success: true, data: result };
  }
}
