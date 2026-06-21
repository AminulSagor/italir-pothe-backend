import { NestFactory } from "@nestjs/core";

import { AppModule } from "../../../app.module";
import { ImportantVerbsDataSyncService } from "../services/important-verbs-data-sync.service";

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["log", "error", "warn"],
  });

  try {
    const syncService = app.get(ImportantVerbsDataSyncService);
    const result = await syncService.syncAll();
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await app.close();
  }
}

void bootstrap();
