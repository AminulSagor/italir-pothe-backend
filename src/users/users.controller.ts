import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
  Query,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole, User } from './entities/user.entity';
import { PresenceService } from '../presence/presence.service';
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
  async getMyProfile(@Req() request: AuthenticatedRequest) {
    return this.usersService.getMyProfile(this.getCurrentUserId(request));
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

  @Get('search/name')
  async searchByName(
    @Req() request: AuthenticatedRequest,
    @Query('q') q: string,
    @Query('page') page = '1',
    @Query('perPage') perPage = '20',
  ) {
    if (!q || !q.trim()) {
      throw new BadRequestException('Query parameter `q` is required');
    }

    const pageNum = Number(page) || 1;
    const perPageNum = Math.min(100, Math.max(1, Number(perPage) || 20));

    const currentUserId = this.getCurrentUserId(request);

    const result = await this.usersService.searchUsersByName(
      q,
      pageNum,
      perPageNum,
      currentUserId,
    );

    return result;
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
