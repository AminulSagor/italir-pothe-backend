import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { File, FileUploadStatus } from '../../files/entities/file.entity';
import { S3Service } from '../../files/services/s3.service';
import { RESUME_ALLOWED_IMAGE_MIME_TYPES, RESUME_LIMITS } from '../constants/resume-limits';
import type { ResumeData } from '../types/resume-data.types';

@Injectable()
export class ResumeAssetService {
  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,
    private readonly s3Service: S3Service,
  ) {}

  async resolveForRender(userId: string, data: ResumeData): Promise<ResumeData> {
    const photoFileId = data.personal?.photoFileId;
    if (!photoFileId) return data;

    const file = await this.fileRepository.findOne({ where: { id: photoFileId } });
    if (!file || file.ownerUserId !== userId) {
      throw new NotFoundException('CV profile photo was not found');
    }
    if (file.uploadStatus !== FileUploadStatus.UPLOADED) {
      throw new BadRequestException('CV profile photo is not ready');
    }
    if (!RESUME_ALLOWED_IMAGE_MIME_TYPES.has(file.mimeType.toLowerCase())) {
      throw new BadRequestException('CV profile photo must be JPEG, PNG, or WebP');
    }
    if (file.sizeBytes > RESUME_LIMITS.profilePhotoBytes) {
      throw new BadRequestException('CV profile photo is too large');
    }

    const photoUrl = await this.s3Service.createSignedReadUrl({
      storageKey: file.storageKey,
      mimeType: file.mimeType,
      originalName: file.originalName,
      dispositionType: 'inline',
    });

    return {
      ...data,
      personal: {
        ...(data.personal ?? {}),
        photoUrl,
      },
    };
  }
}
