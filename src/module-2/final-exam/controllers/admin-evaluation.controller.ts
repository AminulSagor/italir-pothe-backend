import {
  Body,
  Controller,
  Get,
  Param,
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
import {
  EvaluationQueueQueryDto,
  GiveFinalVerdictDto,
  IssueCertificateDto,
  RequestRetakeDto,
} from '../dto/exam-evaluation.dto';
import { ExamEvaluationService } from '../services/exam-evaluation.service';

@Controller('admin/final-exam-evaluations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminEvaluationController {
  constructor(private readonly examEvaluationService: ExamEvaluationService) {}

  @Get('queue')
  async getEvaluationQueue(@Query() query: EvaluationQueueQueryDto) {
    return this.examEvaluationService.getEvaluationQueue(query);
  }

  @Get('queue/:attemptId')
  async getEvaluationDetails(@Param('attemptId') attemptId: string) {
    return this.examEvaluationService.getEvaluationDetails(attemptId);
  }

  @Post('queue/:attemptId/verdict')
  async giveFinalVerdict(
    @Param('attemptId') attemptId: string,
    @Body() dto: GiveFinalVerdictDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.examEvaluationService.giveFinalVerdict(
      attemptId,
      dto,
      this.getAdminId(request),
    );
  }

  @Post('queue/:attemptId/retake')
  async requestRetake(
    @Param('attemptId') attemptId: string,
    @Body() dto: RequestRetakeDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.examEvaluationService.requestRetake(
      attemptId,
      dto,
      this.getAdminId(request),
    );
  }

  @Post('queue/:attemptId/issue-certificate')
  async issueCertificate(
    @Param('attemptId') attemptId: string,
    @Body() dto: IssueCertificateDto,
  ) {
    return this.examEvaluationService.issueCertificate(attemptId, dto);
  }

  private getAdminId(request: AuthenticatedRequest) {
    const adminId = request.user?.id ?? request.user?.sub;

    if (!adminId) {
      throw new UnauthorizedException('Authenticated admin not found');
    }

    return adminId;
  }
}
