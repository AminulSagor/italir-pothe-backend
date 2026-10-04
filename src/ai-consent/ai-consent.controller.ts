import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { AiConsentService } from './ai-consent.service';

@Controller('privacy/ai-consent')
@UseGuards(JwtAuthGuard)
export class AiConsentController {
  constructor(private readonly aiConsentService: AiConsentService) {}

  @Get()
  status(@Req() request: AuthenticatedRequest) {
    return this.aiConsentService.status(this.userId(request));
  }

  @Post()
  grant(
    @Req() request: AuthenticatedRequest,
    @Body('version') version: string,
  ) {
    return this.aiConsentService.grant(this.userId(request), version?.trim());
  }

  @Delete()
  revoke(@Req() request: AuthenticatedRequest) {
    return this.aiConsentService.revoke(this.userId(request));
  }

  private userId(request: AuthenticatedRequest): string {
    return (request.user?.id ?? request.user?.sub)!;
  }
}
