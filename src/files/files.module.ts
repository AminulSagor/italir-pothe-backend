import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { File } from './entities/file.entity';
import { MediaAsset } from './entities/media-asset.entity';
import { FilesService } from './services/files.service';
import { S3Service } from './services/s3.service';
import { FilesController } from './files.controller';
import { MultipartUploadSession } from './entities/multipart-upload-session.entity';
import { VideoTranscodeJob } from './entities/video-transcode-job.entity';
import { CloudFrontSignerService } from './services/cloudfront-signer.service';
import { PdfProcessingService } from './services/pdf-processing.service';
import { S3DeletionJob } from './entities/s3-deletion-job.entity';
import { S3DeletionQueueService } from './services/s3-deletion-queue.service';
import { PendingSingleUpload } from './entities/pending-single-upload.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      File,
      MediaAsset,
      MultipartUploadSession,
      VideoTranscodeJob,
      S3DeletionJob,
      PendingSingleUpload,
    ]),
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    S3Service,
    CloudFrontSignerService,
    PdfProcessingService,
    S3DeletionQueueService,
  ],
  exports: [
    FilesService,
    S3Service,
    CloudFrontSignerService,
    S3DeletionQueueService,
  ],
})
export class FilesModule {}
