import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { AiTutorService } from './ai-tutor.service';
import {
  SendAiTutorMessageDto,
  StartAiTutorVoiceSessionDto,
} from './dto/ai-tutor.dto';

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
