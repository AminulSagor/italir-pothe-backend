import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { FilesModule } from 'src/files/files.module';
import { ExamAttempt } from 'src/module-2/final-exam/entities/exam-attempt.entity';
import { NotificationsModule } from 'src/notifications/notifications.module';

import { AdminCertificatesController } from './controllers/admin-certificates.controller';
import { CertificatesController } from './controllers/certificates.controller';
import { Certificate } from './entities/certificate.entity';
import { CertificateGenerationService } from './services/certificate-generation.service';
import { CertificatesService } from './services/certificates.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Certificate, ExamAttempt]),

    FilesModule,
    NotificationsModule,
    ConfigModule,
  ],

  controllers: [AdminCertificatesController, CertificatesController],

  providers: [CertificatesService, CertificateGenerationService],

  exports: [CertificatesService],
})
export class CertificatesModule {}
