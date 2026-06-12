import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { UserBlocksService } from './user-blocks.service';

type AuthenticatedRequest = Request & {
  user: {
    id: string;
  };
};

@Controller('user-blocks')
@UseGuards(JwtAuthGuard)
export class UserBlocksController {
  constructor(private readonly userBlocksService: UserBlocksService) {}

  @Post(':blockedId')
  blockUser(
    @Req() req: AuthenticatedRequest,
    @Param('blockedId', ParseUUIDPipe) blockedId: string,
  ) {
    return this.userBlocksService.blockUser(req.user.id, blockedId);
  }

  @Delete(':blockedId')
  unblockUser(
    @Req() req: AuthenticatedRequest,
    @Param('blockedId', ParseUUIDPipe) blockedId: string,
  ) {
    return this.userBlocksService.unblockUser(req.user.id, blockedId);
  }

  @Get()
  getMyBlockedUsers(@Req() req: AuthenticatedRequest) {
    return this.userBlocksService.getMyBlockedUsers(req.user.id);
  }

  @Get('status/:otherUserId')
  getBlockStatus(
    @Req() req: AuthenticatedRequest,
    @Param('otherUserId', ParseUUIDPipe) otherUserId: string,
  ) {
    return this.userBlocksService.getBlockStatus(req.user.id, otherUserId);
  }
}
