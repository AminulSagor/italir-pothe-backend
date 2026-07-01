import {
  Controller,
  Get,
  Param,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CallOrchestratorService } from '../services/call-orchestrator.service';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(
    private readonly callOrchestratorService: CallOrchestratorService,
  ) {}

  @Get(':callId')
  getCall(
    @Req() request: AuthenticatedRequest,
    @Param('callId') callId: string,
  ) {
    return this.callOrchestratorService.getCall(
      this.requireUserId(request),
      callId,
    );
  }

  @Post(':callId/answer')
  answerCall(
    @Req() request: AuthenticatedRequest,
    @Param('callId') callId: string,
  ) {
    return this.callOrchestratorService.answer(
      this.requireUserId(request),
      callId,
    );
  }

  @Post(':callId/reject')
  rejectCall(
    @Req() request: AuthenticatedRequest,
    @Param('callId') callId: string,
  ) {
    return this.callOrchestratorService.reject(
      this.requireUserId(request),
      callId,
    );
  }

  @Post(':callId/cancel')
  cancelCall(
    @Req() request: AuthenticatedRequest,
    @Param('callId') callId: string,
  ) {
    return this.callOrchestratorService.cancel(
      this.requireUserId(request),
      callId,
    );
  }

  @Post(':callId/timeout')
  timeoutCall(
    @Req() request: AuthenticatedRequest,
    @Param('callId') callId: string,
  ) {
    return this.callOrchestratorService.timeout(
      this.requireUserId(request),
      callId,
    );
  }

  @Post(':callId/end')
  endCall(
    @Req() request: AuthenticatedRequest,
    @Param('callId') callId: string,
  ) {
    return this.callOrchestratorService.end(
      this.requireUserId(request),
      callId,
    );
  }

  private requireUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATED_USER_MISSING',
        message: 'Authenticated user was not found',
      });
    }

    return userId;
  }
}
