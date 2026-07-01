import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
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
  async issueCertificate(
    @Body() dto: IssueCertificateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.certificatesService.issueCertificate({
      examAttemptId: dto.examAttemptId,
      issuedByAdminId: this.getAdminId(request),
      notifyStudent: dto.notifyStudent === true,
    });
  }

  @Get()
  async findAll(@Query() query: CertificateQueryDto) {
    return this.certificatesService.findAll(query);
  }

  @Get('attempt/:examAttemptId')
  async findByAttemptId(
    @Param(
      'examAttemptId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    examAttemptId: string,
  ) {
    return this.certificatesService.findByAttemptId(examAttemptId);
  }

  @Get('verify/:identifier')
  async verifyCertificate(
    @Param('identifier')
    identifier: string,
  ) {
    return this.certificatesService.verifyCertificate(identifier);
  }

  @Get(':id')
  async findById(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
  ) {
    return this.certificatesService.findById(id);
  }

  @Patch(':id/revoke')
  async revokeCertificate(
    @Param(
      'id',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    id: string,
    @Body() dto: RevokeCertificateDto,
  ) {
    return this.certificatesService.revokeCertificate(id, dto);
  }

  private getAdminId(request: AuthenticatedRequest): string {
    const adminId = request.user?.id ?? request.user?.sub;

    if (!adminId) {
      throw new UnauthorizedException('Authenticated admin not found');
    }

    return adminId;
  }
}
