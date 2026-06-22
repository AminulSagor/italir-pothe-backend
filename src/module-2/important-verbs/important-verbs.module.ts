import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";

import { DailyChallengesModule } from "../daily-challenges/daily-challenges.module";
import { ImportantVerbsController } from "./controllers/important-verbs.controller";
import { ImportantVerbConjugation } from "./entities/important-verb-conjugation.entity";
import { ImportantVerbExample } from "./entities/important-verb-example.entity";
import { ImportantVerbForm } from "./entities/important-verb-form.entity";
import { ImportantVerbImportRun } from "./entities/important-verb-import-run.entity";
import { ImportantVerb } from "./entities/important-verb.entity";
import { UserImportantVerbProgress } from "./entities/user-important-verb-progress.entity";
import { UserSavedImportantVerb } from "./entities/user-saved-important-verb.entity";
import { KaikkiImporterService } from "./importers/kaikki-importer.service";
import { TatoebaImporterService } from "./importers/tatoeba-importer.service";
import { UniMorphImporterService } from "./importers/unimorph-importer.service";
import { LibreTranslateService } from "./services/libretranslate.service";
import { ImportantVerbRulesService } from "./services/important-verb-rules.service";
import { ImportantVerbsDataSyncService } from "./services/important-verbs-data-sync.service";
import { ImportantVerbsService } from "./services/important-verbs.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ImportantVerb,
      ImportantVerbForm,
      ImportantVerbConjugation,
      ImportantVerbExample,
      ImportantVerbImportRun,
      UserSavedImportantVerb,
      UserImportantVerbProgress,
    ]),
    DailyChallengesModule,
  ],
  controllers: [ImportantVerbsController],
  providers: [
    ImportantVerbsService,
    ImportantVerbRulesService,
    LibreTranslateService,
    KaikkiImporterService,
    UniMorphImporterService,
    TatoebaImporterService,
    ImportantVerbsDataSyncService,
  ],
  exports: [ImportantVerbsService, ImportantVerbsDataSyncService],
})
export class ImportantVerbsModule {}
