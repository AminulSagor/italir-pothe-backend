import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

import { AuthService } from './auth.service';

import {
  CreateAdminDto,
  ForgotPasswordDto,
  LoginDto,
  ResendOtpDto,
  ResetPasswordDto,
  SignupDto,
  VerifyOtpDto,
  VerifyPasswordResetOtpDto,
} from './dto/auth.dto';

interface AuthenticatedSession {
  userId: string;
  sessionId: string;
  deviceId: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto) {
    return this.authService.signup(signupDto);
  }

  @Post('admin/create')
  async createAdmin(@Body() createAdminDto: CreateAdminDto) {
    return this.authService.createAdmin(createAdminDto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() verifyOtpDto: VerifyOtpDto) {
    return this.authService.verifyOtp(verifyOtpDto);
  }

  @Post('resend-otp')
  @HttpCode(HttpStatus.OK)
  async resendOtp(@Body() resendOtpDto: ResendOtpDto) {
    return this.authService.resendSignupOtp(resendOtpDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(forgotPasswordDto);
  }

  @Post('verify-reset-otp')
  @HttpCode(HttpStatus.OK)
  async verifyResetOtp(
    @Body()
    verifyDto: VerifyPasswordResetOtpDto,
  ) {
    return this.authService.verifyPasswordResetOtp(verifyDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(resetPasswordDto);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(@Req() request: AuthenticatedRequest) {
    const session = this.getAuthenticatedSession(request);

    return this.authService.logout(
      session.userId,
      session.sessionId,
      session.deviceId,
    );
  }

  private getAuthenticatedSession(
    request: AuthenticatedRequest,
  ): AuthenticatedSession {
    const userId = request.user?.id ?? request.user?.sub;

    const sessionId = request.user?.sessionId;

    const deviceId = request.user?.deviceId;

    if (!userId) {
      throw new UnauthorizedException('Authenticated user not found');
    }

    if (!sessionId || !deviceId) {
      throw new UnauthorizedException('Authentication session not found');
    }

    return {
      userId,
      sessionId,
      deviceId,
    };
  }
}
