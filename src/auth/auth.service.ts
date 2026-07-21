import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';

import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { Repository } from 'typeorm';

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

import { EmailService } from '../common/services/email.service';
import { SmsService } from '../common/services/sms.service';

import { DevicePlatform } from '../devices/enums/device.enums';
import { UserDeviceService } from '../devices/services/user-device.service';

import { AccountModerationStatusService } from '../moderation/account-moderation-status.service';

import { StoreWalletService } from '../package-store/services/store-wallet.service';

import { Otp, OtpPurpose } from '../users/entities/otp.entity';

import { User, UserRole } from '../users/entities/user.entity';
import { SessionSocketRegistryService } from './session-socket-registry.service';

@Injectable()
export class AuthService {
  private readonly otpExpiryMinutes = 10;
  private readonly resetTokenExpiryMinutes = 10;
  private readonly maxOtpAttempts = 5;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,

    private readonly jwtService: JwtService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,

    private readonly storeWalletService: StoreWalletService,

    private readonly accountModerationStatusService: AccountModerationStatusService,

    private readonly userDeviceService: UserDeviceService,

    private readonly sessionSocketRegistry: SessionSocketRegistryService,
  ) {}

  private normalizeIdentifier(identifier: string): string {
    const normalized = identifier.trim();

    return normalized.includes('@') ? normalized.toLowerCase() : normalized;
  }

  private isEmailIdentifier(identifier: string): boolean {
    return identifier.includes('@');
  }

  private async findUserByIdentifier(identifier: string): Promise<User | null> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);

    const isEmail = this.isEmailIdentifier(normalizedIdentifier);

    return this.userRepository.findOne({
      where: isEmail
        ? {
            email: normalizedIdentifier,
          }
        : {
            phone: normalizedIdentifier,
          },
    });
  }

  private async generateAndSaveOtp(
    identifier: string,
    purpose: OtpPurpose,
  ): Promise<string> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);

    await this.otpRepository.delete({
      identifier: normalizedIdentifier,
      purpose,
    });

    const code = randomInt(1000, 10000).toString();

    const codeHash = await bcrypt.hash(code, 10);

    const expiresAt = new Date();

    expiresAt.setMinutes(expiresAt.getMinutes() + this.otpExpiryMinutes);

    const otpRecord = this.otpRepository.create({
      identifier: normalizedIdentifier,
      purpose,
      code: codeHash,
      expiresAt,
      attemptCount: 0,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      verifiedAt: null,
    });

    await this.otpRepository.save(otpRecord);

    return code;
  }

  private async validateAndConsumeOtp(
    identifier: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);

    const otpRecord = await this.otpRepository.findOne({
      where: {
        identifier: normalizedIdentifier,
        purpose,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!otpRecord) {
      throw new BadRequestException('No OTP found. Please request a new code.');
    }

    if (new Date().getTime() > otpRecord.expiresAt.getTime()) {
      await this.otpRepository.delete({
        id: otpRecord.id,
      });

      throw new BadRequestException(
        'OTP has expired. Please request a new code.',
      );
    }

    if (otpRecord.attemptCount >= this.maxOtpAttempts) {
      await this.otpRepository.delete({
        id: otpRecord.id,
      });

      throw new BadRequestException(
        'Too many invalid attempts. Please request a new code.',
      );
    }

    if (!otpRecord.code) {
      throw new BadRequestException('Verification code has already been used');
    }

    const isOtpValid = await bcrypt.compare(code, otpRecord.code);

    if (!isOtpValid) {
      otpRecord.attemptCount += 1;

      await this.otpRepository.save(otpRecord);

      throw new BadRequestException('Invalid verification code.');
    }

    await this.otpRepository.delete({
      id: otpRecord.id,
    });
  }

  private async sendOtp(
    identifier: string,
    otp: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const normalizedIdentifier = this.normalizeIdentifier(identifier);

    if (this.isEmailIdentifier(normalizedIdentifier)) {
      await this.emailService.sendOtpEmail(normalizedIdentifier, otp, purpose);

      return;
    }

    await this.smsService.sendOtp(normalizedIdentifier, otp, purpose);
  }

  private getDevOtpResponse(otp: string): Record<string, string> {
    const isProduction = process.env.NODE_ENV === 'production';

    const emailBypass =
      this.configService.get<string>('EMAIL_BYPASS')?.trim().toLowerCase() ===
      'true';

    const smsBypass =
      this.configService.get<string>('SMS_BYPASS')?.trim().toLowerCase() ===
      'true';

    if (isProduction || (!emailBypass && !smsBypass)) {
      return {};
    }

    return {
      devOtp: otp,
    };
  }

  private hashPasswordResetToken(resetToken: string): string {
    return createHash('sha256').update(resetToken).digest('hex');
  }

  async signup(signupDto: SignupDto) {
    const fullName = signupDto.fullName.trim();

    const email = signupDto.email?.trim().toLowerCase() || null;

    const phone = signupDto.phone?.trim() || null;

    if (!email && !phone) {
      throw new BadRequestException('Email or phone number is required');
    }

    if (email) {
      const existingEmail = await this.userRepository.findOne({
        where: {
          email,
        },
      });

      if (existingEmail) {
        throw new ConflictException('Email already in use');
      }
    }

    if (phone) {
      const existingPhone = await this.userRepository.findOne({
        where: {
          phone,
        },
      });

      if (existingPhone) {
        throw new ConflictException('Phone already in use');
      }
    }

    const password = await bcrypt.hash(signupDto.password, 10);

    const newUser = this.userRepository.create({
      fullName,
      email,
      phone,
      password,
      role: UserRole.USER,
      isVerified: false,
    });

    await this.userRepository.save(newUser);

    await this.storeWalletService.initializeForNewUser(newUser.id);

    const identifier = email ?? phone;

    if (!identifier) {
      throw new BadRequestException('Email or phone number is required');
    }

    const otp = await this.generateAndSaveOtp(
      identifier,
      OtpPurpose.ACCOUNT_VERIFICATION,
    );

    await this.sendOtp(identifier, otp, OtpPurpose.ACCOUNT_VERIFICATION);

    return {
      message: 'Account created successfully. Please verify your OTP.',
      identifier,
      ...this.getDevOtpResponse(otp),
    };
  }

  async createAdmin(createAdminDto: CreateAdminDto) {
    const fullName = createAdminDto.fullName.trim();

    const email = createAdminDto.email?.trim().toLowerCase() || null;

    const phone = createAdminDto.phone?.trim() || null;

    if (!email && !phone) {
      throw new BadRequestException('Email or phone number is required');
    }

    if (email) {
      const existingEmail = await this.userRepository.findOne({
        where: {
          email,
        },
      });

      if (existingEmail) {
        throw new ConflictException('Email already in use');
      }
    }

    if (phone) {
      const existingPhone = await this.userRepository.findOne({
        where: {
          phone,
        },
      });

      if (existingPhone) {
        throw new ConflictException('Phone already in use');
      }
    }

    const password = await bcrypt.hash(createAdminDto.password, 10);

    const newAdmin = this.userRepository.create({
      fullName,
      email,
      phone,
      password,
      role: UserRole.ADMIN,
      isVerified: true,
    });

    await this.userRepository.save(newAdmin);

    return {
      message: 'Admin created successfully',
      user: {
        id: newAdmin.id,
        fullName: newAdmin.fullName,
        email: newAdmin.email,
        phone: newAdmin.phone,
        role: newAdmin.role,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const identifier = this.normalizeIdentifier(loginDto.identifier);

    const user = await this.findUserByIdentifier(identifier);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      loginDto.password,
      user.password,
    );

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.accountModerationStatusService.assertAccountIsActive(user);

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your account first');
    }

    return this.generateToken(user, loginDto.deviceId, loginDto.platform);
  }

  async logout(userId: string, sessionId: string, deviceId: string) {
    await this.userDeviceService.deactivateAuthSession({
      userId,
      sessionId,
      deviceId,
    });

    /*
     * Immediately disconnect all chat/call sockets
     * that were authenticated by this session.
     */
    this.sessionSocketRegistry.disconnectSession(sessionId);

    return {
      ok: true,
      message: 'Logged out successfully',
    };
  }

  async verifyOtp(verifyOtpDto: VerifyOtpDto) {
    const identifier = this.normalizeIdentifier(verifyOtpDto.identifier);

    await this.validateAndConsumeOtp(
      identifier,
      verifyOtpDto.otp,
      OtpPurpose.ACCOUNT_VERIFICATION,
    );

    const user = await this.findUserByIdentifier(identifier);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    user.isVerified = true;

    if (user.email === identifier) {
      user.isEmailVerified = true;
    }

    if (user.phone === identifier) {
      user.isPhoneVerified = true;
    }

    await this.userRepository.save(user);

    await this.accountModerationStatusService.assertAccountIsActive(user);

    const tokenResult = await this.generateToken(
      user,
      verifyOtpDto.deviceId,
      verifyOtpDto.platform,
    );

    return {
      message: 'Account successfully verified',
      ...tokenResult,
    };
  }

  async resendSignupOtp(resendOtpDto: ResendOtpDto) {
    const identifier = this.normalizeIdentifier(resendOtpDto.identifier);

    const user = await this.findUserByIdentifier(identifier);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Account is already verified');
    }

    const otp = await this.generateAndSaveOtp(
      identifier,
      OtpPurpose.ACCOUNT_VERIFICATION,
    );

    await this.sendOtp(identifier, otp, OtpPurpose.ACCOUNT_VERIFICATION);

    return {
      message: 'Verification code sent successfully.',
      ...this.getDevOtpResponse(otp),
    };
  }

  async requestPasswordReset(forgotPasswordDto: ForgotPasswordDto) {
    const identifier = this.normalizeIdentifier(forgotPasswordDto.identifier);

    const user = await this.findUserByIdentifier(identifier);

    /*
     * Do not reveal whether the supplied account exists.
     */
    if (!user) {
      return {
        message: 'If an account exists, a reset code has been sent.',
      };
    }

    const otp = await this.generateAndSaveOtp(
      identifier,
      OtpPurpose.PASSWORD_RESET,
    );

    await this.sendOtp(identifier, otp, OtpPurpose.PASSWORD_RESET);

    return {
      message: 'If an account exists, a reset code has been sent.',
      ...this.getDevOtpResponse(otp),
    };
  }

  async verifyPasswordResetOtp(verifyDto: VerifyPasswordResetOtpDto) {
    const identifier = this.normalizeIdentifier(verifyDto.identifier);

    const otpRecord = await this.otpRepository.findOne({
      where: {
        identifier,
        purpose: OtpPurpose.PASSWORD_RESET,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!otpRecord || !otpRecord.code) {
      throw new BadRequestException(
        'No password reset code was found. Please request a new code.',
      );
    }

    if (otpRecord.expiresAt.getTime() <= Date.now()) {
      await this.otpRepository.delete({
        id: otpRecord.id,
      });

      throw new BadRequestException(
        'Reset code has expired. Please request a new code.',
      );
    }

    if (otpRecord.attemptCount >= this.maxOtpAttempts) {
      await this.otpRepository.delete({
        id: otpRecord.id,
      });

      throw new BadRequestException(
        'Too many invalid attempts. Please request a new code.',
      );
    }

    const isOtpValid = await bcrypt.compare(verifyDto.otp, otpRecord.code);

    if (!isOtpValid) {
      otpRecord.attemptCount += 1;

      await this.otpRepository.save(otpRecord);

      throw new BadRequestException('Invalid verification code.');
    }

    /*
     * Generate a cryptographically secure one-time token.
     *
     * Flutter receives the original token.
     * PostgreSQL stores only its SHA-256 hash.
     */
    const resetToken = randomBytes(32).toString('hex');

    const now = new Date();

    const resetTokenExpiresAt = new Date(
      now.getTime() + this.resetTokenExpiryMinutes * 60 * 1000,
    );

    otpRecord.code = null;
    otpRecord.verifiedAt = now;
    otpRecord.resetTokenHash = this.hashPasswordResetToken(resetToken);
    otpRecord.resetTokenExpiresAt = resetTokenExpiresAt;

    await this.otpRepository.save(otpRecord);

    return {
      message: 'Reset code verified successfully.',
      resetToken,
      expiresInSeconds: this.resetTokenExpiryMinutes * 60,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const resetToken = resetPasswordDto.resetToken.trim().toLowerCase();

    const resetTokenHash = this.hashPasswordResetToken(resetToken);

    const resetRequest = await this.otpRepository.findOne({
      where: {
        purpose: OtpPurpose.PASSWORD_RESET,
        resetTokenHash,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (
      !resetRequest ||
      !resetRequest.verifiedAt ||
      !resetRequest.resetTokenExpiresAt
    ) {
      throw new BadRequestException(
        'Password reset session is invalid or expired.',
      );
    }

    if (resetRequest.resetTokenExpiresAt.getTime() <= Date.now()) {
      await this.otpRepository.delete({
        id: resetRequest.id,
      });

      throw new BadRequestException(
        'Password reset session has expired. Please request a new code.',
      );
    }

    const user = await this.findUserByIdentifier(resetRequest.identifier);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isSamePassword = await bcrypt.compare(
      resetPasswordDto.newPassword,
      user.password,
    );

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from the previous password',
      );
    }

    const newPasswordHash = await bcrypt.hash(resetPasswordDto.newPassword, 10);

    /*
     * Atomically consume the token before changing
     * the password. Only one request can consume it.
     */
    const consumeResult = await this.otpRepository
      .createQueryBuilder()
      .delete()
      .from(Otp)
      .where('"id" = :id', {
        id: resetRequest.id,
      })
      .andWhere('"resetTokenHash" = :resetTokenHash', {
        resetTokenHash,
      })
      .execute();

    if (consumeResult.affected !== 1) {
      throw new BadRequestException(
        'Password reset token has already been used.',
      );
    }

    user.password = newPasswordHash;

    await this.userRepository.save(user);

    /*
     * Log the user out from every device after the
     * password has been changed.
     */
    const revokedSessionIds =
      await this.userDeviceService.deactivateAllAuthSessions(user.id);

    for (const sessionId of revokedSessionIds) {
      this.sessionSocketRegistry.disconnectSession(sessionId);
    }

    return {
      message: 'Password has been successfully updated.',
    };
  }

  private async generateToken(
    user: User,
    deviceId?: string,
    platform?: DevicePlatform,
  ) {
    /*
     * Create a PostgreSQL-backed session before
     * generating the JWT.
     */
    const sessionResult = await this.userDeviceService.startAuthSession(
      user.id,
      {
        deviceId,
        platform,
        expiresAt: this.getSessionExpiresAt(),
      },
    );

    /*
     * A new login on the same installation may revoke
     * an older session. Disconnect its sockets now.
     */
    for (const revokedSessionId of sessionResult.revokedSessionIds) {
      this.sessionSocketRegistry.disconnectSession(revokedSessionId);
    }

    const sessionId = sessionResult.device.authSessionId;

    if (!sessionId) {
      throw new UnauthorizedException(
        'Unable to create authentication session',
      );
    }

    const payload = {
      sub: user.id,
      id: user.id,

      /*
       * sid connects the JWT to the PostgreSQL session.
       * did identifies the app installation.
       */
      sid: sessionId,
      did: sessionResult.device.deviceId,

      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),

      tokenType: 'Bearer',

      user: {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        isVerified: user.isVerified,
        isEmailVerified: user.isEmailVerified,
        isPhoneVerified: user.isPhoneVerified,
        profilePhotoFileId: user.profilePhotoFileId,
        hapticsEnabled: user.hapticsEnabled,
      },
    };
  }

  private getSessionExpiresAt(): Date {
    const configuredDays = Number(
      this.configService.get<string>('AUTH_SESSION_TTL_DAYS') ?? '7',
    );

    const validDays =
      Number.isFinite(configuredDays) && configuredDays > 0
        ? Math.floor(configuredDays)
        : 7;

    return new Date(Date.now() + validDays * 24 * 60 * 60 * 1000);
  }
}
