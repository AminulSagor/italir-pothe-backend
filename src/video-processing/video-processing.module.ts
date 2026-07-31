import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { File } from 'src/files/entities/file.entity';
import { MediaAsset } from 'src/files/entities/media-asset.entity';
import { VideoTranscodeJob } from 'src/files/entities/video-transcode-job.entity';
import { FilesModule } from 'src/files/files.module';

import { VideoTranscodeWorkerService } from './video-transcode-worker.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([File, MediaAsset, VideoTranscodeJob]),
    FilesModule,
  ],
  providers: [VideoTranscodeWorkerService],
})
export class VideoProcessingModule {}
