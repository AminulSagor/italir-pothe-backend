import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminCvTemplatesController } from './controllers/admin-cv-templates.controller';
import { CvTemplatesController } from './controllers/cv-templates.controller';
import { CvTemplate } from './entities/cv-template.entity';
import { CvTemplatesService } from './services/cv-templates.service';

@Module({
  imports: [TypeOrmModule.forFeature([CvTemplate])],
  controllers: [AdminCvTemplatesController, CvTemplatesController],
  providers: [CvTemplatesService],
  exports: [CvTemplatesService],
})
export class CvTemplatesModule {}
