import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConfirmUploadDto } from '../dto/confirm-upload.dto';
import { CreateSignedUploadUrlDto } from '../dto/create-signed-upload-url.dto';
import {
  File,
  FilePurpose,
  FileUploadStatus,
  FileVisibility,
} from '../entities/file.entity';
import {
  MediaAsset,
  MediaAssetStatus,
  MediaType,
} from '../entities/media-asset.entity';
import { S3Service } from './s3.service';
import { UserRole } from 'src/users/entities/user.entity';

export interface FileRequestUser {
  id: string;
  role: UserRole | string;
}

@Injectable()
export class FilesService {
  private readonly imageMaxSize = 5 * 1024 * 1024;
  private readonly audioMaxSize = 20 * 1024 * 1024;
  private readonly pdfMaxSize = 20 * 1024 * 1024;
  private readonly videoMaxSize = 300 * 1024 * 1024;

  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,

    @InjectRepository(MediaAsset)
    private readonly mediaAssetRepository: Repository<MediaAsset>,

    private readonly s3Service: S3Service,
  ) {}

  async createSignedUploadUrl(dto: CreateSignedUploadUrlDto) {
    this.validateFile(dto.mimeType, dto.sizeBytes, dto.filePurpose);

    const storageKey = this.s3Service.createStorageKey(
      dto.filePurpose,
      dto.originalName,
    );

    const signedUploadUrl = await this.s3Service.createSignedUploadUrl({
      storageKey,
      mimeType: dto.mimeType,
    });

    return {
      storageKey,
      publicUrl: this.s3Service.createPublicUrl(storageKey),
      signedUploadUrl,
      method: 'PUT',
      headers: {
        'Content-Type': dto.mimeType,
      },
      expiresInSeconds: this.s3Service.getUploadUrlExpiresInSeconds(),
      maxSizeBytes: this.getMaxSizeByMimeType(dto.mimeType),
    };
  }

  async confirmUpload(dto: ConfirmUploadDto, currentUser: FileRequestUser) {
    this.validateFile(dto.mimeType, dto.sizeBytes, dto.filePurpose);

    const existingFile = await this.fileRepository.findOne({
      where: {
        storageKey: dto.storageKey,
      },
    });

    if (existingFile) {
      throw new BadRequestException('This file has already been confirmed.');
    }

    await this.s3Service.assertObjectExists(dto.storageKey);

    const isAdmin = currentUser.role === UserRole.ADMIN;

    const file = this.fileRepository.create({
      ownerUserId: isAdmin ? null : currentUser.id,
      createdByAdminId: isAdmin ? currentUser.id : null,
      storageKey: dto.storageKey,
      originalName: dto.originalName.trim(),
      mimeType: dto.mimeType.trim(),
      sizeBytes: dto.sizeBytes,
      filePurpose: dto.filePurpose,
      visibility: dto.visibility ?? FileVisibility.PRIVATE,
      uploadStatus: FileUploadStatus.UPLOADED,
      uploadedAt: new Date(),
    });

    const savedFile = await this.fileRepository.save(file);
    const mediaType = dto.mediaType ?? this.inferMediaType(dto.mimeType);

    let mediaAsset: MediaAsset | null = null;

    if (mediaType) {
      mediaAsset = this.mediaAssetRepository.create({
        fileId: savedFile.id,
        title: dto.title?.trim() || null,
        mediaType,
        durationSeconds: dto.durationSeconds ?? null,
        thumbnailFileId: dto.thumbnailFileId ?? null,
        status: MediaAssetStatus.ACTIVE,
      });

      mediaAsset = await this.mediaAssetRepository.save(mediaAsset);
    }

    return {
      message: 'File confirmed successfully.',
      file: savedFile,
      publicUrl: this.s3Service.createPublicUrl(savedFile.storageKey),
      mediaAsset,
    };
  }

  async createSignedReadUrl(fileId: string) {
    const file = await this.findActiveFileById(fileId);
    const signedReadUrl = await this.s3Service.createSignedReadUrl({
      storageKey: file.storageKey,
      mimeType: file.mimeType,
      originalName: file.originalName,
      dispositionType: 'inline',
    });

    return {
      fileId: file.id,
      storageKey: file.storageKey,
      publicUrl: this.s3Service.createPublicUrl(file.storageKey),
      signedReadUrl,
      expiresInSeconds: this.s3Service.getReadUrlExpiresInSeconds(),
    };
  }

  async archiveFile(fileId: string, currentUser: FileRequestUser) {
    const file = await this.findActiveFileById(fileId);

    if (!this.canManageFile(file, currentUser)) {
      throw new ForbiddenException('You cannot manage this file.');
    }

    file.uploadStatus = FileUploadStatus.ARCHIVED;
    await this.fileRepository.save(file);

    await this.mediaAssetRepository.update(
      { fileId: file.id },
      { status: MediaAssetStatus.ARCHIVED },
    );

    return {
      message: 'File archived successfully.',
      fileId: file.id,
    };
  }

  async findActiveFileById(fileId: string): Promise<File> {
    const file = await this.fileRepository.findOne({
      where: {
        id: fileId,
      },
    });

    if (!file || file.uploadStatus === FileUploadStatus.ARCHIVED) {
      throw new NotFoundException('File not found');
    }

    return file;
  }

  async createFileFromBuffer(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    currentUser: FileRequestUser,
    filePurpose: FilePurpose = FilePurpose.REPORT_EVIDENCE,
  ) {
    const sizeBytes = buffer.length;

    this.validateFile(mimeType, sizeBytes, filePurpose);

    const storageKey = this.s3Service.createStorageKey(filePurpose, originalName);

    await this.s3Service.uploadBuffer({ storageKey, buffer, mimeType });

    const isAdmin = currentUser.role === UserRole.ADMIN;

    const file = this.fileRepository.create({
      ownerUserId: isAdmin ? null : currentUser.id,
      createdByAdminId: isAdmin ? currentUser.id : null,
      storageKey,
      originalName: originalName.trim(),
      mimeType: mimeType.trim(),
      sizeBytes,
      filePurpose,
      visibility: FileVisibility.PRIVATE,
      uploadStatus: FileUploadStatus.UPLOADED,
      uploadedAt: new Date(),
    });

    const savedFile = await this.fileRepository.save(file);

    return {
      file: savedFile,
      publicUrl: this.s3Service.createPublicUrl(storageKey),
    };
  }

  private validateFile(
    mimeType: string,
    sizeBytes: number,
    filePurpose: FilePurpose,
  ): void {
    const normalizedMimeType = mimeType.trim().toLowerCase();

    if (!this.isAllowedMimeType(normalizedMimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }

    const maxSize = this.getMaxSizeByMimeType(normalizedMimeType);

    if (sizeBytes > maxSize) {
      throw new BadRequestException(
        `File size exceeds the allowed limit of ${maxSize} bytes.`,
      );
    }

    this.validatePurposeWithMimeType(filePurpose, normalizedMimeType);
  }

  private isAllowedMimeType(mimeType: string): boolean {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/webm',
      'audio/mp4',
      'audio/x-m4a',
      'video/mp4',
      'video/webm',
      'video/quicktime',
      'application/pdf',
    ];

    return allowedMimeTypes.includes(mimeType);
  }

  private getMaxSizeByMimeType(mimeType: string): number {
    if (mimeType.startsWith('image/')) {
      return this.imageMaxSize;
    }

    if (mimeType.startsWith('audio/')) {
      return this.audioMaxSize;
    }

    if (mimeType.startsWith('video/')) {
      return this.videoMaxSize;
    }

    if (mimeType === 'application/pdf') {
      return this.pdfMaxSize;
    }

    return this.imageMaxSize;
  }

  private validatePurposeWithMimeType(
    filePurpose: FilePurpose,
    mimeType: string,
  ): void {
    const imagePurposes = [
      FilePurpose.COURSE_COVER,
      FilePurpose.LESSON_IMAGE,
      FilePurpose.QUIZ_IMAGE,
      FilePurpose.SURVIVAL_IMAGE,
      FilePurpose.PROFILE_AVATAR,
      FilePurpose.REPORT_EVIDENCE,
      FilePurpose.WEBINAR_THUMBNAIL,
    ];

    const audioPurposes = [
      FilePurpose.LESSON_AUDIO,
      FilePurpose.QUIZ_AUDIO,
      FilePurpose.EXAM_SPEAKING_AUDIO,
      FilePurpose.SURVIVAL_AUDIO,
    ];

    const videoPurposes = [
      FilePurpose.LESSON_VIDEO,
      FilePurpose.CAF_HERO_VIDEO,
    ];

    const pdfPurposes = [
      FilePurpose.LESSON_PDF,
      FilePurpose.CERTIFICATE_PDF,
      FilePurpose.CAF_CHECKLIST_PDF,
    ];

    if (imagePurposes.includes(filePurpose) && !mimeType.startsWith('image/')) {
      throw new BadRequestException(`${filePurpose} must be an image file.`);
    }

    if (audioPurposes.includes(filePurpose) && !mimeType.startsWith('audio/')) {
      throw new BadRequestException(`${filePurpose} must be an audio file.`);
    }

    if (videoPurposes.includes(filePurpose) && !mimeType.startsWith('video/')) {
      throw new BadRequestException(`${filePurpose} must be a video file.`);
    }

    if (pdfPurposes.includes(filePurpose) && mimeType !== 'application/pdf') {
      throw new BadRequestException(`${filePurpose} must be a PDF file.`);
    }
  }

  private inferMediaType(mimeType: string): MediaType | null {
    if (mimeType.startsWith('image/')) {
      return MediaType.IMAGE;
    }

    if (mimeType.startsWith('audio/')) {
      return MediaType.AUDIO;
    }

    if (mimeType.startsWith('video/')) {
      return MediaType.VIDEO;
    }

    if (mimeType === 'application/pdf') {
      return MediaType.PDF;
    }

    return null;
  }

  private canManageFile(file: File, currentUser: FileRequestUser): boolean {
    if (currentUser.role === UserRole.ADMIN) {
      return true;
    }

    return file.ownerUserId === currentUser.id;
  }
}
