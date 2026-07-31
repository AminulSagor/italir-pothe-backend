import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

import { VideoWorkerModule } from './video-worker.module';

async function bootstrap() {
  const logger = new Logger('VideoWorkerBootstrap');

  const app = await NestFactory.createApplicationContext(VideoWorkerModule, {
    logger: ['log', 'error', 'warn'],
  });

  const shutdown = async (signal: string) => {
    logger.log(`Received ${signal}. Closing worker.`);
    await app.close();
    process.exit(0);
  };

  process.once('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.once('SIGINT', () => {
    void shutdown('SIGINT');
  });

  logger.log('Video worker started.');
}

void bootstrap();
