import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesModule } from 'src/files/files.module';

import { AdminAiContentReportsController } from './admin-ai-content-reports.controller';
import { AiContentReportsController } from './ai-content-reports.controller';
import { AiContentReportsService } from './ai-content-reports.service';
import { AiContentReport } from './entities/ai-content-report.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiContentReport]), FilesModule],
  controllers: [
    AiContentReportsController,
    AdminAiContentReportsController,
  ],
  providers: [AiContentReportsService],
  exports: [AiContentReportsService],
})
export class AiContentReportsModule {}
