import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CvGenerationsModule } from 'src/cv-generations/cv-generations.module';
import { CvTemplatesModule } from 'src/cv-templates/cv-templates.module';
import { FilesModule } from 'src/files/files.module';

import { CvAssistantController } from './controllers/cv-assistant.controller';
import { CvAssistantMessage } from './entities/cv-assistant-message.entity';
import { CvAssistantSession } from './entities/cv-assistant-session.entity';
import { CvAssistantOpenAiService } from './services/cv-assistant-openai.service';
import { CvAssistantService } from './services/cv-assistant.service';
import { CvQuestionPlannerService } from './services/cv-question-planner.service';
import { CvTemplateAnalysisService } from './services/cv-template-analysis.service';

@Module({
  imports: [
    ConfigModule,

    TypeOrmModule.forFeature([CvAssistantSession, CvAssistantMessage]),

    CvTemplatesModule,

    CvGenerationsModule,

    FilesModule,
  ],

  controllers: [CvAssistantController],

  providers: [
    CvAssistantService,
    CvAssistantOpenAiService,
    CvQuestionPlannerService,
    CvTemplateAnalysisService,
  ],

  exports: [CvAssistantService],
})
export class CvAssistantModule {}
