import {
  Body,
  Controller,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import {
  DeactivateDeviceTokenDto,
  RegisterDeviceTokenDto,
} from '../dto/device-token.dto';
import { DeviceTokensService } from '../services/device-tokens.service';

@Controller('device-tokens')
@UseGuards(JwtAuthGuard)
export class DeviceTokensController {
  constructor(private readonly deviceTokensService: DeviceTokensService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDeviceTokenDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deviceTokensService.register(this.getUserId(request), dto);
  }

  @Post('deactivate')
  async deactivate(
    @Body() dto: DeactivateDeviceTokenDto,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.deviceTokensService.deactivate(this.getUserId(request), dto);
  }

  private getUserId(request: AuthenticatedRequest) {
    const id = request.user?.id ?? request.user?.sub;

    if (!id) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return id;
  }
}
