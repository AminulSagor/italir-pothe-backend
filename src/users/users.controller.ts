import { Controller, Delete, Param, UseGuards, Req, Get, Query, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from './entities/user.entity';
import { PresenceService } from '../presence/presence.service';
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
import type { AuthenticatedRequest } from 'src/common/interfaces/authenticated-request.interface';

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly presenceService: PresenceService,
  ) {}
  private sanitize(user: any) {
    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
      isVerified: user.isVerified,
    };
  }

  @Get('me')
  async getMe(@Req() req: any) {
    const baseUser = this.sanitize(req.user);
    const presence = await this.presenceService.getUserPresence(req.user.id);
    return {
      ...baseUser,
      presence,
    };
  }

  @Get('all')
  async getAllUsers() {
    return this.usersService.findAllUsersWithPresence();
  }

  @Get('search')
  async searchUser(@Query('email') email: string) {
    if (!email) {
      throw new BadRequestException('Email is required');
    }
    const user = await this.usersService.findByEmail(email.toLowerCase());
    return user ? { found: true, user: this.sanitize(user) } : { found: false };
  }
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
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }
}
