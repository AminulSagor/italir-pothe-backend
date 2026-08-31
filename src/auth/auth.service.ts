import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';

import * as bcrypt from 'bcrypt';
import { createHash, randomBytes, randomInt } from 'crypto';
import { DataSource, Repository } from 'typeorm';

import {
  CreateAdminDto,
  ForgotPasswordDto,
  LoginDto,
  LinkSocialAccountDto,
  ResendOtpDto,
  ResetPasswordDto,
  SignupDto,
  SocialLoginDto,
  VerifyOtpDto,
  VerifyPasswordResetOtpDto,
} from './dto/auth.dto';

import { EmailService } from '../common/services/email.service';
import { OtpRateLimitService } from '../common/mail/otp-rate-limit.service';
import { SmsService } from '../common/services/sms.service';

import { DevicePlatform } from '../devices/enums/device.enums';
import { UserDeviceService } from '../devices/services/user-device.service';

import { AccountModerationStatusService } from '../moderation/account-moderation-status.service';

import { StoreWalletService } from '../package-store/services/store-wallet.service';

import { Otp, OtpPurpose } from '../users/entities/otp.entity';

import { User, UserRole } from '../users/entities/user.entity';
import { SessionSocketRegistryService } from './session-socket-registry.service';
import {
  SocialAuthProvider,
  UserSocialAccount,
} from './entities/user-social-account.entity';
import { SocialTokenVerifierService } from './social-token-verifier.service';
import {
  AppleSignInTokenService,
  EncryptedAppleRefreshToken,
} from './apple-sign-in-token.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly otpExpiryMinutes = 10;
  private readonly resetTokenExpiryMinutes = 10;
  private readonly maxOtpAttempts = 5;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,

    @InjectRepository(UserSocialAccount)
    private readonly socialAccountRepository: Repository<UserSocialAccount>,

    private readonly dataSource: DataSource,

    private readonly jwtService: JwtService,
    private readonly smsService: SmsService,
    private readonly emailService: EmailService,
    private readonly otpRateLimitService: OtpRateLimitService,
    private readonly configService: ConfigService,

    private readonly storeWalletService: StoreWalletService,

    private readonly accountModerationStatusService: AccountModerationStatusService,

    private readonly userDeviceService: UserDeviceService,

    private readonly sessionSocketRegistry: SessionSocketRegistryService,
    private readonly socialTokenVerifierService: SocialTokenVerifierService,
    private readonly appleSignInTokenService: AppleSignInTokenService,
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

  async signup(signupDto: SignupDto, ipAddress?: string) {
    const fullName = signupDto.fullName.trim();

    const email = signupDto.email?.trim().toLowerCase() || null;

    const phone = signupDto.phone?.trim() || null;

    if (!email && !phone) {
      throw new BadRequestException('Email or phone number is required');
    }

    const identifier = email ?? phone;

    if (!identifier) {
      throw new BadRequestException('Email or phone number is required');
    }

    await this.otpRateLimitService.recordSendEndpointAttempt({
      identifier,
      ipAddress,
      purpose: OtpPurpose.ACCOUNT_VERIFICATION,
    });

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

    await this.otpRateLimitService.recordSendRequest({
      identifier,
      ipAddress,
      purpose: OtpPurpose.ACCOUNT_VERIFICATION,
    });

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

    if (!user.password) {
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

  async socialLogin(
    providerValue: 'google' | 'facebook' | 'apple',
    dto: SocialLoginDto,
  ) {
    const provider = this.toSocialProvider(providerValue);
    const identity = await this.socialTokenVerifierService.verify(
      provider,
      dto.token,
      dto.tokenType,
      dto.nonce,
      dto.displayName,
    );
    const appleRefreshToken =
      provider === SocialAuthProvider.APPLE
        ? await this.appleSignInTokenService.exchangeAndEncryptAuthorizationCode(
            dto.authorizationCode,
          )
        : null;

    let userId: string;
    try {
      userId = await this.dataSource.transaction(async (manager) => {
        const socialRepository = manager.getRepository(UserSocialAccount);
        const userRepository = manager.getRepository(User);
        const existingIdentity = await socialRepository.findOne({
          where: {
            provider,
            providerUserId: identity.providerUserId,
          },
        });

        if (existingIdentity) {
          if (appleRefreshToken) {
            this.assignAppleRefreshToken(existingIdentity, appleRefreshToken);
            await socialRepository.save(existingIdentity);
          }
          return existingIdentity.userId;
        }

        let user =
          identity.emailVerified && identity.email
            ? await userRepository.findOne({ where: { email: identity.email } })
            : null;

        if (user) {
          const providerConflict = await socialRepository.findOne({
            where: { userId: user.id, provider },
          });
          if (
            providerConflict &&
            providerConflict.providerUserId !== identity.providerUserId
          ) {
            throw new ConflictException(
              `A different ${provider} account is already linked.`,
            );
          }

          if (identity.email && user.email === identity.email) {
            user.isEmailVerified = true;
          }
          user.isVerified = true;
          if (!user.avatarUrl && identity.avatarUrl) {
            user.avatarUrl = identity.avatarUrl;
          }
          await userRepository.save(user);
        } else {
          user = await userRepository.save(
            userRepository.create({
              fullName: identity.fullName,
              name: identity.fullName,
              email: identity.emailVerified ? identity.email : null,
              phone: null,
              password: null,
              role: UserRole.USER,
              isVerified: true,
              isEmailVerified: identity.emailVerified,
              isPhoneVerified: false,
              avatarUrl: identity.avatarUrl,
              joinedAt: new Date(),
            }),
          );
          await this.storeWalletService.getBalancesWithManager(
            user.id,
            manager,
          );
        }

        await socialRepository.save(
          socialRepository.create({
            userId: user.id,
            provider,
            providerUserId: identity.providerUserId,
            providerEmail: identity.email,
            ...this.appleRefreshTokenColumns(appleRefreshToken),
          }),
        );
        return user.id;
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const account = await this.socialAccountRepository.findOne({
          where: {
            provider,
            providerUserId: identity.providerUserId,
          },
        });
        if (account) {
          if (appleRefreshToken) {
            this.assignAppleRefreshToken(account, appleRefreshToken);
            await this.socialAccountRepository.save(account);
          }
          userId = account.userId;
        } else {
          throw new ConflictException(
            'This provider account conflicts with an existing account.',
          );
        }
      } else {
        throw error;
      }
    }

    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user)
      throw new UnauthorizedException('Social account is unavailable.');

    await this.accountModerationStatusService.assertAccountIsActive(user);
    this.logger.log(
      `Social login succeeded provider=${provider} userId=${user.id}`,
    );
    return this.generateToken(user, dto.deviceId, dto.platform);
  }

  async linkSocialAccount(
    userId: string,
    providerValue: 'google' | 'facebook' | 'apple',
    dto: LinkSocialAccountDto,
  ) {
    const provider = this.toSocialProvider(providerValue);
    const identity = await this.socialTokenVerifierService.verify(
      provider,
      dto.token,
      dto.tokenType,
      dto.nonce,
    );
    const appleRefreshToken =
      provider === SocialAuthProvider.APPLE
        ? await this.appleSignInTokenService.exchangeAndEncryptAuthorizationCode(
            dto.authorizationCode,
          )
        : null;

    try {
      await this.dataSource.transaction(async (manager) => {
        const userRepository = manager.getRepository(User);
        const socialRepository = manager.getRepository(UserSocialAccount);
        const user = await userRepository.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException('User not found');

        const identityOwner = await socialRepository.findOne({
          where: { provider, providerUserId: identity.providerUserId },
        });
        if (identityOwner && identityOwner.userId !== user.id) {
          throw new ConflictException(
            'This provider account is already linked to another user.',
          );
        }

        const currentProvider = await socialRepository.findOne({
          where: { userId: user.id, provider },
        });
        if (currentProvider) {
          if (currentProvider.providerUserId !== identity.providerUserId) {
            throw new ConflictException(
              `A different ${provider} account is already linked.`,
            );
          }
          if (appleRefreshToken) {
            this.assignAppleRefreshToken(currentProvider, appleRefreshToken);
            await socialRepository.save(currentProvider);
          }
          return;
        }

        if (identity.emailVerified && identity.email) {
          const emailOwner = await userRepository.findOne({
            where: { email: identity.email },
          });
          if (emailOwner && emailOwner.id !== user.id) {
            throw new ConflictException(
              'The verified provider email belongs to another account.',
            );
          }
          if (!user.email) user.email = identity.email;
          if (user.email === identity.email) user.isEmailVerified = true;
        }

        await userRepository.save(user);
        await socialRepository.save(
          socialRepository.create({
            userId: user.id,
            provider,
            providerUserId: identity.providerUserId,
            providerEmail: identity.email,
            ...this.appleRefreshTokenColumns(appleRefreshToken),
          }),
        );
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          'This provider account conflicts with an existing account.',
        );
      }
      throw error;
    }

    this.logger.log(
      `Social account linked provider=${provider} userId=${userId}`,
    );
    return { message: `${provider} account linked successfully.` };
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

  async verifyOtp(verifyOtpDto: VerifyOtpDto, ipAddress?: string) {
    const identifier = this.normalizeIdentifier(verifyOtpDto.identifier);

    await this.otpRateLimitService.recordVerificationAttempt({
      identifier,
      ipAddress,
      purpose: OtpPurpose.ACCOUNT_VERIFICATION,
    });

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

  async resendSignupOtp(resendOtpDto: ResendOtpDto, ipAddress?: string) {
    const identifier = this.normalizeIdentifier(resendOtpDto.identifier);

    await this.otpRateLimitService.recordSendEndpointAttempt({
      identifier,
      ipAddress,
      purpose: OtpPurpose.ACCOUNT_VERIFICATION,
    });

    const user = await this.findUserByIdentifier(identifier);

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Account is already verified');
    }

    await this.otpRateLimitService.recordSendRequest({
      identifier,
      ipAddress,
      purpose: OtpPurpose.ACCOUNT_VERIFICATION,
    });

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

  async requestPasswordReset(
    forgotPasswordDto: ForgotPasswordDto,
    ipAddress?: string,
  ) {
    const identifier = this.normalizeIdentifier(forgotPasswordDto.identifier);
    await this.otpRateLimitService.recordSendEndpointAttempt({
      identifier,
      ipAddress,
      purpose: OtpPurpose.PASSWORD_RESET,
    });

    const user = await this.findUserByIdentifier(identifier);

    /*
     * Do not reveal whether the supplied account exists.
     */
    if (!user) {
      return {
        message: 'If an account exists, a reset code has been sent.',
      };
    }

    await this.otpRateLimitService.recordSendRequest({
      identifier,
      ipAddress,
      purpose: OtpPurpose.PASSWORD_RESET,
    });

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

  async verifyPasswordResetOtp(
    verifyDto: VerifyPasswordResetOtpDto,
    ipAddress?: string,
  ) {
    const identifier = this.normalizeIdentifier(verifyDto.identifier);

    await this.otpRateLimitService.recordVerificationAttempt({
      identifier,
      ipAddress,
      purpose: OtpPurpose.PASSWORD_RESET,
    });

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

    const isSamePassword = user.password
      ? await bcrypt.compare(resetPasswordDto.newPassword, user.password)
      : false;

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
        hasPassword: Boolean(user.password),
      },
    };
  }

  private toSocialProvider(
    value: 'google' | 'facebook' | 'apple',
  ): SocialAuthProvider {
    if (value === 'google') return SocialAuthProvider.GOOGLE;
    if (value === 'facebook') return SocialAuthProvider.FACEBOOK;
    return SocialAuthProvider.APPLE;
  }

  private appleRefreshTokenColumns(
    encrypted: EncryptedAppleRefreshToken | null,
  ): Partial<UserSocialAccount> {
    if (!encrypted) return {};
    return {
      appleRefreshTokenCiphertext: encrypted.ciphertext,
      appleRefreshTokenIv: encrypted.iv,
      appleRefreshTokenAuthTag: encrypted.authTag,
    };
  }

  private assignAppleRefreshToken(
    account: UserSocialAccount,
    encrypted: EncryptedAppleRefreshToken,
  ): void {
    account.appleRefreshTokenCiphertext = encrypted.ciphertext;
    account.appleRefreshTokenIv = encrypted.iv;
    account.appleRefreshTokenAuthTag = encrypted.authTag;
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== 'object') return false;
    const record = error as {
      code?: string;
      driverError?: { code?: string };
    };
    return record.code === '23505' || record.driverError?.code === '23505';
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
