import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import {
  ChangePasswordDto,
  RequestEmailChangeOtpDto,
  RequestPhoneChangeOtpDto,
  UpdateProfileNameDto,
  UpdateProfilePhotoDto,
  UpdateUserPreferencesDto,
  VerifyEmailChangeOtpDto,
  VerifyPhoneChangeOtpDto,
} from './dto/user-profile.dto';
import { User, UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

interface AuthenticatedRequest extends Request {
  user?: User;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getMyProfile(@Req() request: AuthenticatedRequest) {
    return this.usersService.getMyProfile(this.getCurrentUserId(request));
  }

  @Patch('me/name')
  async updateMyName(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfileNameDto,
  ) {
    return this.usersService.updateMyName(this.getCurrentUserId(request), dto);
  }

  @Post('me/email/request-otp')
  async requestEmailChangeOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestEmailChangeOtpDto,
  ) {
    return this.usersService.requestEmailChangeOtp(
      this.getCurrentUserId(request),
      dto,
    );
  }

  @Post('me/email/verify-otp')
  async verifyEmailChangeOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyEmailChangeOtpDto,
  ) {
    return this.usersService.verifyEmailChangeOtp(
      this.getCurrentUserId(request),
      dto,
    );
  }

  @Post('me/phone/request-otp')
  async requestPhoneChangeOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestPhoneChangeOtpDto,
  ) {
    return this.usersService.requestPhoneChangeOtp(
      this.getCurrentUserId(request),
      dto,
    );
  }

  @Post('me/phone/verify-otp')
  async verifyPhoneChangeOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyPhoneChangeOtpDto,
  ) {
    return this.usersService.verifyPhoneChangeOtp(
      this.getCurrentUserId(request),
      dto,
    );
  }

  @Patch('me/photo')
  async updateMyProfilePhoto(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateProfilePhotoDto,
  ) {
    return this.usersService.updateMyProfilePhoto(
      this.getCurrentUserId(request),
      dto,
    );
  }

  @Patch('me/preferences')
  async updateMyPreferences(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateUserPreferencesDto,
  ) {
    return this.usersService.updateMyPreferences(
      this.getCurrentUserId(request),
      dto,
    );
  }

  @Patch('me/password')
  async changeMyPassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.usersService.changeMyPassword(
      this.getCurrentUserId(request),
      dto,
    );
  }

  @Delete('me')
  async deleteMyAccount(@Req() request: AuthenticatedRequest) {
    return this.usersService.deleteMyAccount(this.getCurrentUserId(request));
  }

  @Delete('user/:id')
  @Roles(UserRole.ADMIN)
  async deleteUser(@Param('id') id: string) {
    return this.usersService.deleteUser(id);
  }

  @Delete('admin/:id')
  @Roles(UserRole.ADMIN)
  async deleteAdmin(@Param('id') id: string) {
    return this.usersService.deleteAdmin(id);
  }

  private getCurrentUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.id;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }
}
