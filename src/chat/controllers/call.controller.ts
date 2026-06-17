import {
  Body,
  Controller,
  Get,
  Post,
  Param,
  UseGuards,
  Req,
  Query,
  BadRequestException,
} from '@nestjs/common';

import { CallService } from '../services/call.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { InitiateCallDto } from '../dto/initiate-call.dto';

@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallController {
  constructor(private readonly callService: CallService) {}

  @Post('initiate')
  async initiateCall(
    @Req() request: AuthenticatedRequest,
    @Body() dto: InitiateCallDto,
  ) {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new BadRequestException('User not found');
    }

    const result = await this.callService.initiateCallForRest({
      directConversationId: dto.directConversationId,
      callerId: userId,
      recipientId: dto.recipientId,
      callType: dto.callType,
    });

    return {
      ok: true,
      ...result,
    };
  }

  @Post(':callId/answer')
  async answerCall(
    @Param('callId') callId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new BadRequestException('User not found');
    }

    const result = await this.callService.answerCallForRest(callId, userId);

    return {
      ok: true,
      ...result,
    };
  }

  @Post(':callId/reject')
  async rejectCall(
    @Param('callId') callId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new BadRequestException('User not found');
    }

    const call = await this.callService.rejectCallForRest(callId, userId);

    return {
      ok: true,
      call,
    };
  }

  @Post(':callId/end')
  async endCall(
    @Param('callId') callId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new BadRequestException('User not found');
    }

    const call = await this.callService.endCallForRest(callId, userId);

    return {
      ok: true,
      call,
    };
  }

  @Get('history/:directConversationId')
  async getCallHistory(
    @Param('directConversationId') directConversationId: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? Math.min(parseInt(limit, 10), 100) : 50;
    const history = await this.callService.getCallHistory(
      directConversationId,
      limitNum,
    );

    return {
      ok: true,
      calls: history,
    };
  }

  @Get('active/:directConversationId')
  async getActiveCall(
    @Param('directConversationId') directConversationId: string,
  ) {
    const activeCall =
      await this.callService.getActiveCall(directConversationId);

    return {
      ok: true,
      call: activeCall || null,
    };
  }
}
