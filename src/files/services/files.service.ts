import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { ConfirmUploadDto } from '../dto/confirm-upload.dto';
import { CreateSignedUploadUrlDto } from '../dto/create-signed-upload-url.dto';
import {
  CompleteMultipartUploadDto,
  InitiateMultipartUploadDto,
  SignMultipartPartsDto,
} from '../dto/multipart-upload.dto';
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
  VideoTranscodeStatus,
} from '../entities/media-asset.entity';
import {
  MultipartUploadSession,
  MultipartUploadStatus,
} from '../entities/multipart-upload-session.entity';
import {
  VideoTranscodeJob,
  VideoTranscodeJobStatus,
} from '../entities/video-transcode-job.entity';
import { CloudFrontSignerService } from './cloudfront-signer.service';
import { S3Service } from './s3.service';
import { UserRole } from 'src/users/entities/user.entity';

export interface FileRequestUser {
  id: string;
  role: UserRole | string;
}

@Injectable()
export class FilesService {
  private readonly imageMaxSize: number;
  private readonly audioMaxSize: number;
  private readonly pdfMaxSize: number;
  private readonly videoMaxSize: number;

  private readonly multipartPartSizeBytes: number;
  private readonly multipartSessionTtlHours: number;
  private readonly singlePutThresholdBytes: number;
  private readonly videoTranscodeMaxAttempts: number;

  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,

    @InjectRepository(MediaAsset)
    private readonly mediaAssetRepository: Repository<MediaAsset>,

    @InjectRepository(MultipartUploadSession)
    private readonly multipartSessionRepository: Repository<MultipartUploadSession>,

    @InjectRepository(VideoTranscodeJob)
    private readonly videoTranscodeJobRepository: Repository<VideoTranscodeJob>,

    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
    private readonly cloudFrontSignerService: CloudFrontSignerService,
  ) {
    this.imageMaxSize = this.getConfiguredPositiveInteger(
      'FILE_MAX_IMAGE_SIZE_BYTES',
      5 * 1024 * 1024,
    );

    this.audioMaxSize = this.getConfiguredPositiveInteger(
      'FILE_MAX_AUDIO_SIZE_BYTES',
      20 * 1024 * 1024,
    );

    this.pdfMaxSize = this.getConfiguredPositiveInteger(
      'FILE_MAX_PDF_SIZE_BYTES',
      20 * 1024 * 1024,
    );

    this.videoMaxSize = this.getConfiguredPositiveInteger(
      'FILE_MAX_VIDEO_SIZE_BYTES',
      2 * 1024 * 1024 * 1024,
    );

    this.multipartPartSizeBytes = this.getConfiguredPositiveInteger(
      'S3_MULTIPART_PART_SIZE_BYTES',
      16 * 1024 * 1024,
    );

    this.multipartSessionTtlHours = this.getConfiguredPositiveInteger(
      'S3_MULTIPART_SESSION_TTL_HOURS',
      24,
    );

    this.singlePutThresholdBytes = this.getConfiguredPositiveInteger(
      'S3_SINGLE_PUT_THRESHOLD_BYTES',
      100 * 1024 * 1024,
    );

    this.videoTranscodeMaxAttempts = this.getConfiguredPositiveInteger(
      'VIDEO_TRANSCODE_MAX_ATTEMPTS',
      3,
    );

    const minimumMultipartPartSize = 5 * 1024 * 1024;

    if (this.multipartPartSizeBytes < minimumMultipartPartSize) {
      throw new Error(
        'S3_MULTIPART_PART_SIZE_BYTES must be at least 5242880 bytes.',
      );
    }
  }

  /**
   * Creates a normal single-PUT upload URL.
   *
   * Large videos must use multipart upload instead.
   */
  async createSignedUploadUrl(dto: CreateSignedUploadUrlDto) {
    const normalizedMimeType = dto.mimeType.trim().toLowerCase();

    this.validateFile(normalizedMimeType, dto.sizeBytes, dto.filePurpose);

    if (
      normalizedMimeType.startsWith('video/') &&
      dto.sizeBytes >= this.singlePutThresholdBytes
    ) {
      throw new BadRequestException(
        'Large videos must use the multipart upload endpoints.',
      );
    }

    const storageKey = this.s3Service.createStorageKey(
      dto.filePurpose,
      dto.originalName,
    );

    const signedUploadUrl = await this.s3Service.createSignedUploadUrl({
      storageKey,
      mimeType: normalizedMimeType,
    });

    return {
      storageKey,
      publicUrl: this.s3Service.createPublicUrl(storageKey),
      signedUploadUrl,
      method: 'PUT',
      headers: {
        'Content-Type': normalizedMimeType,
      },
      expiresInSeconds: this.s3Service.getUploadUrlExpiresInSeconds(),
      maxSizeBytes: this.getMaxSizeByMimeType(normalizedMimeType),
    };
  }

  /**
   * Confirms an existing single-PUT upload.
   *
   * It verifies the real S3 object size and content type before
   * inserting the database records.
   */
  async confirmUpload(dto: ConfirmUploadDto, currentUser: FileRequestUser) {
    const normalizedMimeType = dto.mimeType.trim().toLowerCase();

    this.validateFile(normalizedMimeType, dto.sizeBytes, dto.filePurpose);

    const existingFile = await this.fileRepository.findOne({
      where: {
        storageKey: dto.storageKey,
      },
    });

    if (existingFile) {
      throw new BadRequestException('This file has already been confirmed.');
    }

    await this.s3Service.assertObjectMatches({
      storageKey: dto.storageKey,
      expectedSizeBytes: dto.sizeBytes,
      expectedMimeType: normalizedMimeType,
    });

    return this.persistUploadedFile({
      storageKey: dto.storageKey,
      originalName: dto.originalName,
      mimeType: normalizedMimeType,
      sizeBytes: dto.sizeBytes,
      filePurpose: dto.filePurpose,
      visibility: dto.visibility ?? FileVisibility.PRIVATE,
      title: dto.title,
      mediaType: dto.mediaType,
      durationSeconds: dto.durationSeconds,
      thumbnailFileId: dto.thumbnailFileId,
      currentUser,
    });
  }

  /**
   * Starts an S3 multipart upload and stores its temporary session.
   */
  async initiateMultipartUpload(
    dto: InitiateMultipartUploadDto,
    currentUser: FileRequestUser,
  ) {
    const normalizedMimeType = dto.mimeType.trim().toLowerCase();

    this.validateFile(normalizedMimeType, dto.sizeBytes, dto.filePurpose);

    if (!normalizedMimeType.startsWith('video/')) {
      throw new BadRequestException(
        'Multipart upload is currently enabled only for videos.',
      );
    }

    const totalParts = Math.ceil(dto.sizeBytes / this.multipartPartSizeBytes);

    if (totalParts <= 0) {
      throw new BadRequestException('The multipart upload has no parts.');
    }

    if (totalParts > 10_000) {
      throw new BadRequestException(
        'The selected file requires more than 10,000 multipart parts.',
      );
    }

    const storageKey = this.s3Service.createStorageKey(
      dto.filePurpose,
      dto.originalName,
    );

    const uploadId = await this.s3Service.initiateMultipartUpload({
      storageKey,
      mimeType: normalizedMimeType,
      expectedSizeBytes: dto.sizeBytes,
    });

    const isAdmin = currentUser.role === UserRole.ADMIN;

    const session = this.multipartSessionRepository.create({
      uploadId,
      storageKey,
      originalName: dto.originalName.trim(),
      mimeType: normalizedMimeType,
      sizeBytes: dto.sizeBytes,
      filePurpose: dto.filePurpose,
      visibility: dto.visibility ?? FileVisibility.PRIVATE,

      ownerUserId: isAdmin ? null : currentUser.id,

      createdByAdminId: isAdmin ? currentUser.id : null,

      partSizeBytes: this.multipartPartSizeBytes,
      totalParts,
      status: MultipartUploadStatus.INITIATED,

      expiresAt: new Date(
        Date.now() + this.multipartSessionTtlHours * 60 * 60 * 1000,
      ),

      completedAt: null,
      abortedAt: null,
    });

    try {
      const savedSession = await this.multipartSessionRepository.save(session);

      return {
        sessionId: savedSession.id,
        storageKey: savedSession.storageKey,
        partSizeBytes: savedSession.partSizeBytes,
        totalParts: savedSession.totalParts,
        expiresAt: savedSession.expiresAt,
        maxSizeBytes: this.videoMaxSize,
      };
    } catch (error) {
      await this.s3Service
        .abortMultipartUpload({
          storageKey,
          uploadId,
        })
        .catch(() => undefined);

      throw error;
    }
  }

  /**
   * Generates signed PUT URLs for selected multipart part numbers.
   */
  async signMultipartParts(
    sessionId: string,
    dto: SignMultipartPartsDto,
    currentUser: FileRequestUser,
  ) {
    const session = await this.getMultipartSession(sessionId, currentUser);

    await this.assertMultipartSessionUsable(session);

    const uniquePartNumbers = [...new Set(dto.partNumbers)].sort(
      (left, right) => left - right,
    );

    if (uniquePartNumbers.length !== dto.partNumbers.length) {
      throw new BadRequestException(
        'Duplicate multipart part numbers are not allowed.',
      );
    }

    for (const partNumber of uniquePartNumbers) {
      if (partNumber < 1 || partNumber > session.totalParts) {
        throw new BadRequestException(
          `Part ${partNumber} is outside the expected range of 1 to ${session.totalParts}.`,
        );
      }
    }

    const parts = await Promise.all(
      uniquePartNumbers.map(async (partNumber) => {
        const signedUploadUrl =
          await this.s3Service.createSignedMultipartPartUrl({
            storageKey: session.storageKey,
            uploadId: session.uploadId,
            partNumber,
          });

        return {
          partNumber,
          signedUploadUrl,
        };
      }),
    );

    return {
      sessionId: session.id,
      parts,
      expiresInSeconds: this.s3Service.getMultipartUrlExpiresInSeconds(),
    };
  }

  /**
   * Completes the multipart upload, verifies the S3 object and
   * creates the File, MediaAsset and video-transcoding job.
   */
  async completeMultipartUpload(
    sessionId: string,
    dto: CompleteMultipartUploadDto,
    currentUser: FileRequestUser,
  ) {
    const session = await this.getMultipartSession(sessionId, currentUser);

    /*
     * Makes this endpoint safe to retry when S3 completed successfully
     * but the browser did not receive the API response.
     */
    const existingFile = await this.fileRepository.findOne({
      where: {
        storageKey: session.storageKey,
      },
    });

    if (existingFile) {
      const existingMediaAsset = await this.mediaAssetRepository.findOne({
        where: {
          fileId: existingFile.id,
        },
      });

      return {
        message: 'Multipart upload was already completed.',
        file: existingFile,
        publicUrl: this.s3Service.createPublicUrl(existingFile.storageKey),
        mediaAsset: existingMediaAsset,
      };
    }

    await this.assertMultipartSessionUsable(session);

    this.validateCompletedParts(session, dto.parts);

    /*
     * S3 completion may already have succeeded during an earlier
     * request that timed out. In that situation, do not try to
     * complete it again.
     */
    const objectAlreadyExists = await this.s3Service.objectExists(
      session.storageKey,
    );

    if (!objectAlreadyExists) {
      await this.s3Service.completeMultipartUpload({
        storageKey: session.storageKey,
        uploadId: session.uploadId,
        parts: dto.parts.map((part) => ({
          partNumber: part.partNumber,
          eTag: part.eTag,
        })),
      });
    }

    await this.s3Service.assertObjectMatches({
      storageKey: session.storageKey,
      expectedSizeBytes: session.sizeBytes,
      expectedMimeType: session.mimeType,
    });

    return this.persistUploadedFile({
      storageKey: session.storageKey,
      originalName: session.originalName,
      mimeType: session.mimeType,
      sizeBytes: session.sizeBytes,
      filePurpose: session.filePurpose,
      visibility: session.visibility,
      title: dto.title,
      mediaType: MediaType.VIDEO,
      durationSeconds: dto.durationSeconds,
      thumbnailFileId: dto.thumbnailFileId,
      currentUser,
      multipartSessionId: session.id,
    });
  }

  /**
   * Cancels an unfinished multipart upload.
   */
  async abortMultipartUpload(sessionId: string, currentUser: FileRequestUser) {
    const session = await this.getMultipartSession(sessionId, currentUser);

    if (session.status === MultipartUploadStatus.COMPLETED) {
      throw new BadRequestException(
        'A completed multipart upload cannot be aborted.',
      );
    }

    if (
      session.status !== MultipartUploadStatus.ABORTED &&
      session.status !== MultipartUploadStatus.EXPIRED
    ) {
      await this.s3Service
        .abortMultipartUpload({
          storageKey: session.storageKey,
          uploadId: session.uploadId,
        })
        .catch(() => undefined);
    }

    session.status = MultipartUploadStatus.ABORTED;
    session.abortedAt = new Date();

    await this.multipartSessionRepository.save(session);

    return {
      message: 'Multipart upload aborted.',
      sessionId: session.id,
    };
  }

  /**
   * Returns the current HLS processing status and CloudFront access.
   *
   * Call this only after the lesson/course service has verified that
   * the current user is entitled to access the lesson.
   */
  async getVideoPlaybackAccess(fileId: string) {
    const file = await this.findActiveFileById(fileId);

    const mediaAsset = await this.mediaAssetRepository.findOne({
      where: {
        fileId: file.id,
        mediaType: MediaType.VIDEO,
        status: MediaAssetStatus.ACTIVE,
      },
    });

    if (!mediaAsset) {
      throw new NotFoundException('Video media asset was not found.');
    }

    if (
      mediaAsset.transcodeStatus !== VideoTranscodeStatus.READY ||
      !mediaAsset.hlsMasterKey
    ) {
      return {
        fileId: file.id,
        mediaAssetId: mediaAsset.id,
        status: mediaAsset.transcodeStatus,
        streamUrl: null,
        durationSeconds: mediaAsset.durationSeconds,
        width: mediaAsset.sourceWidth,
        height: mediaAsset.sourceHeight,
        retryable: mediaAsset.transcodeStatus === VideoTranscodeStatus.FAILED,
      };
    }

    const cloudFrontAccess =
      this.cloudFrontSignerService.createSignedCookiesForHlsMaster(
        mediaAsset.hlsMasterKey,
      );

    return {
      fileId: file.id,
      mediaAssetId: mediaAsset.id,
      status: mediaAsset.transcodeStatus,

      streamUrl: this.s3Service.createCloudFrontUrl(mediaAsset.hlsMasterKey),

      durationSeconds: mediaAsset.durationSeconds,

      width: mediaAsset.sourceWidth,
      height: mediaAsset.sourceHeight,

      requiresSignedCookies: this.cloudFrontSignerService.isEnabled(),

      cloudFrontAccess,
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
      signedReadUrl,
      expiresInSeconds: this.s3Service.getReadUrlExpiresInSeconds(),
      file: {
        id: file.id,
        originalName: file.originalName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        filePurpose: file.filePurpose,
        visibility: file.visibility,
        uploadStatus: file.uploadStatus,
        publicUrl: this.s3Service.createPublicUrl(file.storageKey),
      },
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
      {
        fileId: file.id,
      },
      {
        status: MediaAssetStatus.ARCHIVED,
      },
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
    const normalizedMimeType = mimeType.trim().toLowerCase();

    this.validateFile(normalizedMimeType, sizeBytes, filePurpose);

    const storageKey = this.s3Service.createStorageKey(
      filePurpose,
      originalName,
    );

    await this.s3Service.uploadBuffer({
      storageKey,
      buffer,
      mimeType: normalizedMimeType,
    });

    const isAdmin = currentUser.role === UserRole.ADMIN;

    const file = this.fileRepository.create({
      ownerUserId: isAdmin ? null : currentUser.id,

      createdByAdminId: isAdmin ? currentUser.id : null,

      storageKey,
      originalName: originalName.trim(),
      mimeType: normalizedMimeType,
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

  /**
   * Creates all permanent database records for a successfully
   * uploaded file.
   *
   * Videos also receive a pending PostgreSQL transcode job.
   */
  private async persistUploadedFile(params: {
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    filePurpose: FilePurpose;
    visibility: FileVisibility;
    title?: string;
    mediaType?: MediaType;
    durationSeconds?: number;
    thumbnailFileId?: string;
    currentUser: FileRequestUser;
    multipartSessionId?: string;
  }) {
    const result = await this.dataSource.transaction(async (manager) => {
      const fileRepository = manager.getRepository(File);

      const mediaAssetRepository = manager.getRepository(MediaAsset);

      const videoJobRepository = manager.getRepository(VideoTranscodeJob);

      const sessionRepository = manager.getRepository(MultipartUploadSession);

      const duplicateFile = await fileRepository.findOne({
        where: {
          storageKey: params.storageKey,
        },
      });

      if (duplicateFile) {
        const duplicateMediaAsset = await mediaAssetRepository.findOne({
          where: {
            fileId: duplicateFile.id,
          },
        });

        return {
          file: duplicateFile,
          mediaAsset: duplicateMediaAsset,
        };
      }

      const normalizedMimeType = params.mimeType.trim().toLowerCase();

      const inferredMediaType = this.inferMediaType(normalizedMimeType);

      if (
        params.mediaType &&
        inferredMediaType &&
        params.mediaType !== inferredMediaType
      ) {
        throw new BadRequestException(
          'Media type does not match the uploaded MIME type.',
        );
      }

      const mediaType = params.mediaType ?? inferredMediaType;

      const isAdmin = params.currentUser.role === UserRole.ADMIN;

      const file = fileRepository.create({
        ownerUserId: isAdmin ? null : params.currentUser.id,

        createdByAdminId: isAdmin ? params.currentUser.id : null,

        storageKey: params.storageKey,
        originalName: params.originalName.trim(),
        mimeType: normalizedMimeType,
        sizeBytes: params.sizeBytes,
        filePurpose: params.filePurpose,
        visibility: params.visibility,
        uploadStatus: FileUploadStatus.UPLOADED,
        uploadedAt: new Date(),
      });

      const savedFile = await fileRepository.save(file);

      let mediaAsset: MediaAsset | null = null;

      if (mediaType) {
        const isVideo = mediaType === MediaType.VIDEO;

        mediaAsset = mediaAssetRepository.create({
          fileId: savedFile.id,
          title: params.title?.trim() || null,
          mediaType,

          durationSeconds: params.durationSeconds ?? null,

          thumbnailFileId: params.thumbnailFileId ?? null,

          transcodeStatus: isVideo
            ? VideoTranscodeStatus.PENDING
            : VideoTranscodeStatus.NOT_REQUIRED,

          hlsMasterKey: null,
          hlsGenerationId: null,
          sourceWidth: null,
          sourceHeight: null,
          transcodeError: null,
          transcodedAt: null,

          status: MediaAssetStatus.ACTIVE,
        });

        mediaAsset = await mediaAssetRepository.save(mediaAsset);

        if (isVideo) {
          const videoJob = videoJobRepository.create({
            mediaAssetId: mediaAsset.id,
            sourceFileId: savedFile.id,

            status: VideoTranscodeJobStatus.PENDING,

            attempts: 0,
            maxAttempts: this.videoTranscodeMaxAttempts,

            availableAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
            completedAt: null,
          });

          await videoJobRepository.save(videoJob);
        }
      }

      if (params.multipartSessionId) {
        await sessionRepository.update(
          {
            id: params.multipartSessionId,
          },
          {
            status: MultipartUploadStatus.COMPLETED,
            completedAt: new Date(),
          },
        );
      }

      return {
        file: savedFile,
        mediaAsset,
      };
    });

    return {
      message: 'File confirmed successfully.',
      file: result.file,

      publicUrl: this.s3Service.createPublicUrl(result.file.storageKey),

      mediaAsset: result.mediaAsset,
    };
  }

  private async getMultipartSession(
    sessionId: string,
    currentUser: FileRequestUser,
  ): Promise<MultipartUploadSession> {
    const session = await this.multipartSessionRepository.findOne({
      where: {
        id: sessionId,
      },
    });

    if (!session) {
      throw new NotFoundException('Multipart upload session was not found.');
    }

    const isAdmin = currentUser.role === UserRole.ADMIN;

    const canManageSession =
      isAdmin ||
      session.ownerUserId === currentUser.id ||
      session.createdByAdminId === currentUser.id;

    if (!canManageSession) {
      throw new ForbiddenException('You cannot manage this multipart upload.');
    }

    return session;
  }

  private async assertMultipartSessionUsable(
    session: MultipartUploadSession,
  ): Promise<void> {
    if (session.status !== MultipartUploadStatus.INITIATED) {
      throw new BadRequestException(`Multipart upload is ${session.status}.`);
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.s3Service
        .abortMultipartUpload({
          storageKey: session.storageKey,
          uploadId: session.uploadId,
        })
        .catch(() => undefined);

      session.status = MultipartUploadStatus.EXPIRED;

      session.abortedAt = new Date();

      await this.multipartSessionRepository.save(session);

      throw new BadRequestException('Multipart upload session has expired.');
    }
  }

  private validateCompletedParts(
    session: MultipartUploadSession,
    parts: Array<{
      partNumber: number;
      eTag: string;
    }>,
  ): void {
    const sortedParts = [...parts].sort(
      (left, right) => left.partNumber - right.partNumber,
    );

    if (sortedParts.length !== session.totalParts) {
      throw new BadRequestException(
        `Expected ${session.totalParts} uploaded parts but received ${sortedParts.length}.`,
      );
    }

    sortedParts.forEach((part, index) => {
      const expectedPartNumber = index + 1;

      if (part.partNumber !== expectedPartNumber) {
        throw new BadRequestException(
          `Missing or invalid multipart part ${expectedPartNumber}.`,
        );
      }

      if (!part.eTag.trim()) {
        throw new BadRequestException(
          `ETag is missing for part ${part.partNumber}.`,
        );
      }
    });
  }

  private validateFile(
    mimeType: string,
    sizeBytes: number,
    filePurpose: FilePurpose,
  ): void {
    const normalizedMimeType = mimeType.trim().toLowerCase();

    if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0) {
      throw new BadRequestException(
        'File size must be a positive integer expressed in bytes.',
      );
    }

    if (!this.isAllowedMimeType(normalizedMimeType)) {
      throw new BadRequestException(`Unsupported file type: ${mimeType}`);
    }

    const maxSize = this.getMaxSizeByMimeType(normalizedMimeType);

    if (sizeBytes > maxSize) {
      throw new BadRequestException(
        `File size exceeds the allowed limit of ${this.formatFileSize(maxSize)}.`,
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
      FilePurpose.NOTIFICATION_IMAGE,
      FilePurpose.CV_PHOTO,
      FilePurpose.CV_TEMPLATE_THUMBNAIL,
      FilePurpose.CV_GENERATED_IMAGE,
      FilePurpose.CV_REFERENCE_IMAGE,
    ];

    const audioPurposes = [
      FilePurpose.LESSON_AUDIO,
      FilePurpose.QUIZ_AUDIO,
      FilePurpose.EXAM_SPEAKING_AUDIO,
      FilePurpose.SURVIVAL_AUDIO,
      FilePurpose.SKILL_BUILDER_AUDIO,
    ];

    const videoPurposes = [
      FilePurpose.LESSON_VIDEO,
      FilePurpose.CAF_HERO_VIDEO,
      FilePurpose.SKILL_BUILDER_VIDEO,
    ];

    const pdfPurposes = [
      FilePurpose.LESSON_PDF,
      FilePurpose.CERTIFICATE_PDF,
      FilePurpose.CAF_CHECKLIST_PDF,
      FilePurpose.SURVIVAL_PDF,
      FilePurpose.SKILL_BUILDER_PDF,
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
    const normalizedMimeType = mimeType.trim().toLowerCase();

    if (normalizedMimeType.startsWith('image/')) {
      return MediaType.IMAGE;
    }

    if (normalizedMimeType.startsWith('audio/')) {
      return MediaType.AUDIO;
    }

    if (normalizedMimeType.startsWith('video/')) {
      return MediaType.VIDEO;
    }

    if (normalizedMimeType === 'application/pdf') {
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

  private getConfiguredPositiveInteger(
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
      throw new Error(`${environmentName} must be a positive safe integer.`);
    }

    return parsedValue;
  }

  private formatFileSize(sizeBytes: number): string {
    const gibibyte = 1024 * 1024 * 1024;

    const mebibyte = 1024 * 1024;

    if (sizeBytes >= gibibyte) {
      return `${Number((sizeBytes / gibibyte).toFixed(2))} GiB`;
    }

    return `${Number((sizeBytes / mebibyte).toFixed(2))} MiB`;
  }
}
