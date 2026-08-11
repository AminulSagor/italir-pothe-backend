import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FilesModule } from '../files/files.module';
import { File } from '../files/entities/file.entity';
import { AdminResumeTemplateController } from './controllers/admin-resume-template.controller';
import { ResumeAiController } from './controllers/resume-ai.controller';
import { ResumeDocumentController } from './controllers/resume-document.controller';
import { ResumeTemplateController } from './controllers/resume-template.controller';
import { ResumeDocument } from './entities/resume-document.entity';
import { ResumeGeneration } from './entities/resume-generation.entity';
import { ResumeTemplate } from './entities/resume-template.entity';
import { ResumeTemplateVersion } from './entities/resume-template-version.entity';
import { ResumeAiSuggestionService } from './services/resume-ai-suggestion.service';
import { ResumeLlmClientService } from './services/resume-llm-client.service';
import { ResumeAssetService } from './services/resume-asset.service';
import { ResumeDocumentService } from './services/resume-document.service';
import { ResumeRendererService } from './services/resume-renderer.service';
import { ResumeSchemaService } from './services/resume-schema.service';
import { ResumeStorageService } from './services/resume-storage.service';
import { ResumeTemplateEngineService } from './services/resume-template-engine.service';
import { ResumeTemplateSecurityService } from './services/resume-template-security.service';
import { ResumeTemplateService } from './services/resume-template.service';

@Module({
  imports: [
    FilesModule,
    TypeOrmModule.forFeature([
      File,
      ResumeTemplate,
      ResumeTemplateVersion,
      ResumeDocument,
      ResumeGeneration,
    ]),
  ],
  controllers: [
    AdminResumeTemplateController,
    ResumeTemplateController,
    ResumeDocumentController,
    ResumeAiController,
  ],
  providers: [
    ResumeSchemaService,
    ResumeTemplateSecurityService,
    ResumeTemplateEngineService,
    ResumeRendererService,
    ResumeStorageService,
    ResumeAssetService,
    ResumeTemplateService,
    ResumeDocumentService,
    ResumeLlmClientService,
    ResumeAiSuggestionService,
  ],
  exports: [ResumeTemplateService, ResumeDocumentService],
})
export class ResumeStudioModule {}
