import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  StartExamAttemptDto,
  SubmitExamAnswerDto,
  SubmitExamAttemptDto,
} from '../dto/exam-attempt.dto';
import { ExamsService } from '../services/exams.service';

@Controller('final-exams')
@UseGuards(JwtAuthGuard)
export class ExamsController {
  constructor(private readonly examsService: ExamsService) {}

  @Get('my-courses/gateways')
  async getMyCourseExamGateways(@Req() request: AuthenticatedRequest) {
    return this.examsService.getMyCourseExamGateways(
      this.getUserId(request),
    );
  }

  @Get('courses/:courseId/gateway')
  async getExamGateway(
    @Param('courseId') courseId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.examsService.getExamGateway(courseId, this.getUserId(request));
  }

  @Post('start')
  async startAttempt(
    @Body() dto: StartExamAttemptDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.examsService.startAttempt(dto, this.getUserId(request));
  }

  @Get('attempts/:attemptId')
  async findAttempt(
    @Param('attemptId') attemptId: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<unknown> {
    return this.examsService.findAttempt(attemptId, this.getUserId(request));
  }

  @Post('attempts/:attemptId/answers')
  async submitAnswer(
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitExamAnswerDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.examsService.submitAnswer(
      attemptId,
      dto,
      this.getUserId(request),
    );
  }

  @Post('attempts/:attemptId/submit')
  async submitAttempt(
    @Param('attemptId') attemptId: string,
    @Body() dto: SubmitExamAttemptDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.examsService.submitAttempt(
      attemptId,
      dto,
      this.getUserId(request),
    );
  }

  @Get('attempts/:attemptId/result')
  async getResult(
    @Param('attemptId') attemptId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.examsService.getResult(attemptId, this.getUserId(request));
  }

  private getUserId(request: AuthenticatedRequest) {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }
}
