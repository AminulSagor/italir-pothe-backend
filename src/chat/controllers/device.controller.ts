import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';
import { RegisterDeviceDto } from '../dto/register-device.dto';
import { UserDeviceService } from '../services/user-device.service';

@Controller('chat/devices')
@UseGuards(JwtAuthGuard)
export class DeviceController {
  constructor(private readonly userDeviceService: UserDeviceService) {}

  @Post('register')
  async registerDevice(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RegisterDeviceDto,
  ) {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new BadRequestException('User not found');
    }

    const device = await this.userDeviceService.registerDevice(userId, dto);

    return {
      ok: true,
      message: 'Device registered successfully',
      device,
    };
  }

  @Post('deactivate')
  async deactivateDevice(
    @Req() request: AuthenticatedRequest,
    @Body('deviceId') deviceId: string,
  ) {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new BadRequestException('User not found');
    }

    if (!deviceId) {
      throw new BadRequestException('deviceId is required');
    }

    await this.userDeviceService.deactivateDevice(userId, deviceId);

    return {
      ok: true,
      message: 'Device deactivated successfully',
    };
  }
}
