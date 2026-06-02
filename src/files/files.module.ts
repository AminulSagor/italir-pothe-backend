import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { File } from './entities/file.entity';
import { MediaAsset } from './entities/media-asset.entity';
import { FilesService } from './services/files.service';
import { S3Service } from './services/s3.service';
import { FilesController } from './files.controller';

@Module({
  imports: [TypeOrmModule.forFeature([File, MediaAsset])],
  controllers: [FilesController],
  providers: [FilesService, S3Service],
  exports: [FilesService, S3Service],
})
export class FilesModule {}
