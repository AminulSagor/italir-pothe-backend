import {
  Controller,
  Get,
  Param,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { CertificatesService } from '../services/certificates.service';

@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get('verify/:certificateNumber')
  async verifyCertificate(
    @Param('certificateNumber') certificateNumber: string,
  ) {
    return this.certificatesService.verifyCertificate(certificateNumber);
  }

  @Get('my')
  @UseGuards(JwtAuthGuard)
  async findMyCertificates(@Req() request: AuthenticatedRequest) {
    return this.certificatesService.findByUser(this.getUserId(request));
  }

  @Get('attempt/:examAttemptId')
  @UseGuards(JwtAuthGuard)
  async findByAttemptId(
    @Param('examAttemptId') examAttemptId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const certificate =
      await this.certificatesService.findByAttemptId(examAttemptId);

    if (certificate.userId !== this.getUserId(request)) {
      throw new UnauthorizedException(
        'Certificate does not belong to this user',
      );
    }

    return certificate;
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findById(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.certificatesService.findOwnedCertificate(
      id,
      this.getUserId(request),
    );
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return id;
  }
}
