import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';
import { CertificateQueryDto } from '../dto/certificate-query.dto';
import { IssueCertificateDto } from '../dto/issue-certificate.dto';
import { RevokeCertificateDto } from '../dto/revoke-certificate.dto';
import { CertificatesService } from '../services/certificates.service';

@Controller('admin/certificates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminCertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post('issue')
  async issueCertificate(@Body() dto: IssueCertificateDto) {
    return this.certificatesService.issueCertificate({
      userId: dto.userId,
      courseId: dto.courseId,
      examAttemptId: dto.examAttemptId,
      pdfFileId: dto.pdfFileId ?? null,
    });
  }

  @Get()
  async findAll(@Query() query: CertificateQueryDto) {
    return this.certificatesService.findAll(query);
  }

  @Get('attempt/:examAttemptId')
  async findByAttemptId(@Param('examAttemptId') examAttemptId: string) {
    return this.certificatesService.findByAttemptId(examAttemptId);
  }

  @Get('verify/:certificateNumber')
  async verifyCertificate(
    @Param('certificateNumber') certificateNumber: string,
  ) {
    return this.certificatesService.verifyCertificate(certificateNumber);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.certificatesService.findById(id);
  }

  @Patch(':id/revoke')
  async revokeCertificate(
    @Param('id') id: string,
    @Body() dto: RevokeCertificateDto,
  ) {
    return this.certificatesService.revokeCertificate(id, dto);
  }
}
