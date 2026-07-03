import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import type { FileRequestUser } from 'src/files/services/files.service';

import { AttachCvAssetsDto } from '../dto/attach-cv-assets.dto';
import { CreateCvSessionDto } from '../dto/create-cv-session.dto';
import { SendCvMessageDto } from '../dto/send-cv-message.dto';
import { CvAssistantService } from '../services/cv-assistant.service';

@Controller('cv-assistant')
@UseGuards(JwtAuthGuard)
export class CvAssistantController {
  constructor(private readonly cvAssistantService: CvAssistantService) {}

  @Post('sessions')
  createSession(
    @Body()
    dto: CreateCvSessionDto,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.cvAssistantService.createSession(
      dto,
      this.getCurrentUser(request),
    );
  }

  @Get('sessions/:sessionId')
  getSession(
    @Param('sessionId', new ParseUUIDPipe())
    sessionId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    const currentUser = this.getCurrentUser(request);

    return this.cvAssistantService.getSession(sessionId, currentUser.id);
  }

  @Post('sessions/:sessionId/messages')
  sendMessage(
    @Param('sessionId', new ParseUUIDPipe())
    sessionId: string,

    @Body()
    dto: SendCvMessageDto,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.cvAssistantService.sendMessage(
      sessionId,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Post('sessions/:sessionId/skip')
  skipCurrentQuestion(
    @Param('sessionId', new ParseUUIDPipe())
    sessionId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.cvAssistantService.skipCurrentQuestion(
      sessionId,
      this.getCurrentUser(request),
    );
  }

  @Post('sessions/:sessionId/attachments')
  attachAssets(
    @Param('sessionId', new ParseUUIDPipe())
    sessionId: string,

    @Body()
    dto: AttachCvAssetsDto,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.cvAssistantService.attachAssets(
      sessionId,
      dto,
      this.getCurrentUser(request),
    );
  }

  @Post('sessions/:sessionId/generate')
  generateCv(
    @Param('sessionId', new ParseUUIDPipe())
    sessionId: string,

    @Req()
    request: AuthenticatedRequest,
  ) {
    return this.cvAssistantService.generateCv(
      sessionId,
      this.getCurrentUser(request),
    );
  }

  private getCurrentUser(request: AuthenticatedRequest): FileRequestUser {
    const id = request.user?.id ?? request.user?.sub;

    const role = request.user?.role;

    if (!id || !role) {
      throw new UnauthorizedException('Authenticated user not found.');
    }

    return {
      id,
      role,
    };
  }
}
