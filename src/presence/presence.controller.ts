import { Controller, Get,Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { PresenceService } from './presence.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

@Controller('presence')
@UseGuards(JwtAuthGuard)
export class PresenceController {
  constructor(private readonly presenceService: PresenceService) {}

  @Post('heartbeat')
  heartbeat(@Req() req: any) {
    const userId = req.user.id;
    return this.presenceService.heartbeat(userId);
  }
}
