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
  DeactivateDeviceDto,
  RegisterDeviceDto,
} from '../dto/register-device.dto';
import { UserDeviceService } from '../services/user-device.service';

@Controller('devices')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  constructor(private readonly userDeviceService: UserDeviceService) {}

  @Post('register')
  async registerDevice(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RegisterDeviceDto,
  ) {
    const device = await this.userDeviceService.registerDevice(
      this.getUserId(request),
      dto,
    );

    return {
      ok: true,
      message: 'Device registered successfully',
      device,
    };
  }

  @Post('deactivate')
  async deactivateDevice(
    @Req() request: AuthenticatedRequest,
    @Body() dto: DeactivateDeviceDto,
  ) {
    await this.userDeviceService.deactivateDevice(this.getUserId(request), dto);

    return {
      ok: true,
      message: 'Device deactivated successfully',
    };
  }

  private getUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }
}
