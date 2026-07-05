import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import {
  RequestEmailChangeOtpDto,
  RequestPhoneChangeOtpDto,
  VerifyEmailChangeOtpDto,
  VerifyPhoneChangeOtpDto,
} from '../users/dto/user-profile.dto';
import { ChangeUserPasswordDto } from './dto/change-user-password.dto';
import { ConfirmAvatarUploadDto } from './dto/confirm-avatar-upload.dto';
import { DeleteUserAccountDto } from './dto/delete-user-account.dto';
import { PrepareAvatarUploadDto } from './dto/prepare-avatar-upload.dto';
import { UpdateFullNameDto } from './dto/update-full-name.dto';
import {
  AvatarUploadPreparationResponse,
  ContactChangeOtpResponse,
  UserSettingsMessageResponse,
  UserSettingsProfileResponse,
} from './types/user-settings.types';
import { UserSettingsService } from './user-settings.service';

@Controller('user-settings')
@UseGuards(JwtAuthGuard)
export class UserSettingsController {
  constructor(private readonly userSettingsService: UserSettingsService) {}

  @Get()
  getProfile(
    @Req() request: AuthenticatedRequest,
  ): Promise<UserSettingsProfileResponse> {
    return this.userSettingsService.getProfile(this.getUserId(request));
  }

  @Patch('full-name')
  updateFullName(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateFullNameDto,
  ): Promise<UserSettingsProfileResponse> {
    return this.userSettingsService.updateFullName(
      this.getUserId(request),
      dto,
    );
  }

  @Post('email/request-otp')
  requestEmailChangeOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestEmailChangeOtpDto,
  ): Promise<ContactChangeOtpResponse> {
    return this.userSettingsService.requestEmailChangeOtp(
      this.getUserId(request),
      dto,
    );
  }

  @Post('email/verify-otp')
  verifyEmailChangeOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyEmailChangeOtpDto,
  ): Promise<UserSettingsProfileResponse> {
    return this.userSettingsService.verifyEmailChangeOtp(
      this.getUserId(request),
      dto,
    );
  }

  @Post('phone/request-otp')
  requestPhoneChangeOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RequestPhoneChangeOtpDto,
  ): Promise<ContactChangeOtpResponse> {
    return this.userSettingsService.requestPhoneChangeOtp(
      this.getUserId(request),
      dto,
    );
  }

  @Post('phone/verify-otp')
  verifyPhoneChangeOtp(
    @Req() request: AuthenticatedRequest,
    @Body() dto: VerifyPhoneChangeOtpDto,
  ): Promise<UserSettingsProfileResponse> {
    return this.userSettingsService.verifyPhoneChangeOtp(
      this.getUserId(request),
      dto,
    );
  }

  @Post('avatar/upload-url')
  prepareAvatarUpload(
    @Body() dto: PrepareAvatarUploadDto,
  ): Promise<AvatarUploadPreparationResponse> {
    return this.userSettingsService.prepareAvatarUpload(dto);
  }

  @Post('avatar/confirm')
  confirmAvatarUpload(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ConfirmAvatarUploadDto,
  ): Promise<UserSettingsProfileResponse> {
    return this.userSettingsService.confirmAvatarUpload(
      this.getUserId(request),
      request.user?.role ?? 'user',
      dto,
    );
  }

  @Patch('password')
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangeUserPasswordDto,
  ): Promise<UserSettingsMessageResponse> {
    return this.userSettingsService.changePassword(
      this.getUserId(request),
      dto,
    );
  }

  @Delete('account')
  deleteAccount(
    @Req() request: AuthenticatedRequest,
    @Body() dto: DeleteUserAccountDto,
  ): Promise<UserSettingsMessageResponse> {
    return this.userSettingsService.deleteAccount(
      this.getUserId(request),
      dto,
    );
  }

  private getUserId(request: AuthenticatedRequest): string {
    const userId = request.user?.id ?? request.user?.sub;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    return userId;
  }
}
