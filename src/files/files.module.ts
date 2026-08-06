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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      File,
      MediaAsset,
      MultipartUploadSession,
      VideoTranscodeJob,
    ]),
  ],
  controllers: [FilesController],
  providers: [
    FilesService,
    S3Service,
    CloudFrontSignerService,
    PdfProcessingService,
  ],
  exports: [FilesService, S3Service, CloudFrontSignerService],
})
export class FilesModule {}
