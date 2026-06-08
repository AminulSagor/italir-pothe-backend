import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminCertificatesController } from './controllers/admin-certificates.controller';
import { CertificatesController } from './controllers/certificates.controller';
import { Certificate } from './entities/certificate.entity';
import { CertificatesService } from './services/certificates.service';

@Module({
  imports: [TypeOrmModule.forFeature([Certificate])],
  controllers: [AdminCertificatesController, CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
