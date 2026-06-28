import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AiTutorService } from './ai-tutor.service';
import {
  EvaluateAiTutorLevelTestDto,
  SendAiTutorMessageDto,
  StartAiTutorVoiceSessionDto,
  TranscribeAiTutorLevelTestDto,
} from './dto/ai-tutor.dto';

interface UploadedAudioFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

@Controller('ai-tutor')
@UseGuards(JwtAuthGuard)
export class AiTutorController {
  constructor(private readonly aiTutorService: AiTutorService) {}

  @Post('voice/sessions')
  async startVoiceSession(
    @Req() request: AuthenticatedRequest,
    @Body() dto: StartAiTutorVoiceSessionDto,
  ) {
    const user = this.requireUser(request);
    return this.aiTutorService.startVoiceSession(user, dto);
  }

  @Post('voice/sessions/:sessionId/heartbeat')
  async heartbeatVoiceSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    const user = this.requireUser(request);
    return this.aiTutorService.heartbeatVoiceSession(user.id, sessionId);
  }

  @Post('voice/sessions/:sessionId/end')
  async endVoiceSession(
    @Req() request: AuthenticatedRequest,
    @Param('sessionId') sessionId: string,
  ) {
    const user = this.requireUser(request);
    return this.aiTutorService.endVoiceSession(user.id, sessionId);
  }

  @Post('chat')
  async sendMessage(
    @Req() request: AuthenticatedRequest,
    @Body() dto: SendAiTutorMessageDto,
  ) {
    const user = this.requireUser(request);
    return this.aiTutorService.sendMessage(user, dto);
  }

  @Get('level-test/profile')
  async getLevelTestProfile(@Req() request: AuthenticatedRequest) {
    const user = this.requireUser(request);
    return this.aiTutorService.getLevelTestProfile(user.id);
  }

  @Post('level-test/transcribe')
  @UseInterceptors(
    FileInterceptor('audio', {
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  async transcribeLevelTestAnswer(
    @Req() request: AuthenticatedRequest,
    @Body() dto: TranscribeAiTutorLevelTestDto,
    @UploadedFile() audio?: UploadedAudioFile,
  ) {
    const user = this.requireUser(request);
    if (!audio?.buffer?.length) {
      throw new BadRequestException('A recorded audio answer is required');
    }

    return this.aiTutorService.transcribeLevelTestAnswer(user.id, dto, audio);
  }

  @Post('level-test/evaluate')
  async evaluateLevelTest(
    @Req() request: AuthenticatedRequest,
    @Body() dto: EvaluateAiTutorLevelTestDto,
  ) {
    const user = this.requireUser(request);
    return this.aiTutorService.evaluateLevelTest(user, dto);
  }

  private requireUser(request: AuthenticatedRequest) {
    const userId = request.user?.id ?? request.user?.sub;
    if (!userId) {
      throw new UnauthorizedException('Authenticated user is required');
    }

    return {
      id: userId,
      fullName: request.user?.fullName,
    };
  }
}
