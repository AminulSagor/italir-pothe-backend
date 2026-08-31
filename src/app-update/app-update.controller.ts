import {
  Body,
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';

import { AppUpdateService } from './app-update.service';
import {
  AppUpdatePlatformQueryDto,
  UpdateAppUpdateConfigurationDto,
} from './dto/app-update.dto';
import { AppUpdatePlatform } from './entities/app-update-configuration.entity';

@Controller('app-update')
export class PublicAppUpdateController {
  constructor(private readonly appUpdateService: AppUpdateService) {}

  @Get('config')
  async getConfiguration(@Query() query: AppUpdatePlatformQueryDto) {
    return this.appUpdateService.getPublicConfiguration(query.platform);
  }
}

@Controller('admin/app-update')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAppUpdateController {
  constructor(private readonly appUpdateService: AppUpdateService) {}

  @Get('config')
  async getConfigurations() {
    return this.appUpdateService.getAdminConfigurations();
  }

  @Put('config/:platform')
  async updateConfiguration(
    @Param('platform', new ParseEnumPipe(AppUpdatePlatform))
    platform: AppUpdatePlatform,
    @Body() dto: UpdateAppUpdateConfigurationDto,
  ) {
    return this.appUpdateService.updateConfiguration(platform, dto);
  }
}
