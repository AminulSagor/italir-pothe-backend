import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS ?? 1));

  app.use(json({ limit: '20mb' }));
  app.use(
    urlencoded({
      extended: true,
      limit: '20mb',
    }),
  );

  const corsOrigin = process.env.CORS_ORIGIN;

  app.enableCors({
    origin:
      !corsOrigin || corsOrigin === '*'
        ? true
        : corsOrigin.split(',').map((origin) => origin.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const host = process.env.HOST?.trim() || '0.0.0.0';
  const port = Number(process.env.PORT ?? 5000);
  await app.listen(port, host);
}

void bootstrap();
