import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { User } from 'src/users/entities/user.entity';
import { AdminCvTemplatesController } from './controllers/admin-cv-templates.controller';
import { CvBuilderController } from './controllers/cv-builder.controller';
import { CvDocument } from './entities/cv-document.entity';
import { CvTemplate } from './entities/cv-template.entity';
import { CvTemplateDefaultLayout } from './entities/cv-template-default-layout.entity';
import { CvBuilderService } from './services/cv-builder.service';

@Module({
  imports: [TypeOrmModule.forFeature([CvTemplate, CvDocument, CvTemplateDefaultLayout, User])],
  controllers: [AdminCvTemplatesController, CvBuilderController],
  providers: [CvBuilderService],
  exports: [CvBuilderService],
})
export class CvBuilderModule {}
