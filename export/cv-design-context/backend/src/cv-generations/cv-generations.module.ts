import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CvTemplatesModule } from 'src/cv-templates/cv-templates.module';
import { FilesModule } from 'src/files/files.module';

import { CvGenerationsController } from './controllers/cv-generations.controller';
import { CvGeneration } from './entities/cv-generation.entity';
import { CvGenerationsService } from './services/cv-generations.service';
import { CvImageGenerationService } from './services/cv-image-generation.service';
import { CvPromptService } from './services/cv-prompt.service';
import { PackageStoreModule } from 'src/package-store/package-store.module';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([CvGeneration]),
    CvTemplatesModule,
    FilesModule,
    PackageStoreModule,
  ],
  controllers: [CvGenerationsController],
  providers: [CvGenerationsService, CvImageGenerationService, CvPromptService],
  exports: [CvGenerationsService],
})
export class CvGenerationsModule {}
