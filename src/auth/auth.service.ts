import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import {
  CreateAdminDto,
  ForgotPasswordDto,
  LoginDto,
  ResendOtpDto,
  ResetPasswordDto,
  SignupDto,
  VerifyOtpDto,
} from './dto/auth.dto';
import { EmailService } from '../notifications/email.service';
import { SmsService } from '../notifications/sms.service';
import { Otp, OtpPurpose } from '../users/entities/otp.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  private readonly otpExpiryMinutes = 10;
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
        ? { email: normalizedIdentifier }
        : { phone: normalizedIdentifier },
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

    if (new Date() > otpRecord.expiresAt) {
      await this.otpRepository.delete({ id: otpRecord.id });
      throw new BadRequestException(
        'OTP has expired. Please request a new code.',
      );
    }

    if (otpRecord.attemptCount >= this.maxOtpAttempts) {
      await this.otpRepository.delete({ id: otpRecord.id });
      throw new BadRequestException(
        'Too many invalid attempts. Please request a new code.',
      );
    }

    const isOtpValid = await bcrypt.compare(code, otpRecord.code);

    if (!isOtpValid) {
      otpRecord.attemptCount += 1;
      await this.otpRepository.save(otpRecord);
      throw new BadRequestException('Invalid verification code.');
    }

    await this.otpRepository.delete({ id: otpRecord.id });
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

    await this.smsService.sendOtp(normalizedIdentifier, otp);
  }

  private getDevOtpResponse(otp: string) {
    const isProduction = process.env.NODE_ENV === 'production';

    const emailBypass =
      this.configService.get<string>('EMAIL_BYPASS')?.trim() === 'true';

    const smsBypass =
      this.configService.get<string>('SMS_BYPASS')?.trim() === 'true';

    if (isProduction || (!emailBypass && !smsBypass)) {
      return {};
    }

    return {
      devOtp: otp,
    };
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
        where: { email },
      });

      if (existingEmail) {
        throw new ConflictException('Email already in use');
      }
    }

    if (phone) {
      const existingPhone = await this.userRepository.findOne({
        where: { phone },
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

    const identifier = email ?? phone;

    if (!identifier) {
      throw new BadRequestException('Email or phone number is required');
    }

    const otp = await this.generateAndSaveOtp(
      identifier,
      OtpPurpose.ACCOUNT_VERIFICATION,
    );

    await this.sendOtp(identifier, otp, OtpPurpose.ACCOUNT_VERIFICATION);

    // return {
    //   message: 'Account created successfully. Please verify your OTP.',
    //   identifier,
    // };

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
        where: { email },
      });

      if (existingEmail) {
        throw new ConflictException('Email already in use');
      }
    }

    if (phone) {
      const existingPhone = await this.userRepository.findOne({
        where: { phone },
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

    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your account first');
    }

    return this.generateToken(user);
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
    await this.userRepository.save(user);

    return {
      message: 'Account successfully verified',
      ...this.generateToken(user),
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

    // return {
    //   message: 'Verification code sent successfully.',
    // };

    return {
      message: 'Verification code sent successfully.',
      ...this.getDevOtpResponse(otp),
    };
  }

  async requestPasswordReset(forgotPasswordDto: ForgotPasswordDto) {
    const identifier = this.normalizeIdentifier(forgotPasswordDto.identifier);
    const user = await this.findUserByIdentifier(identifier);

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

    // return {
    //   message: 'If an account exists, a reset code has been sent.',
    // };

    return {
      message: 'If an account exists, a reset code has been sent.',
      ...this.getDevOtpResponse(otp),
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const identifier = this.normalizeIdentifier(resetPasswordDto.identifier);

    await this.validateAndConsumeOtp(
      identifier,
      resetPasswordDto.otp,
      OtpPurpose.PASSWORD_RESET,
    );

    const user = await this.findUserByIdentifier(identifier);

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

    user.password = await bcrypt.hash(resetPasswordDto.newPassword, 10);
    await this.userRepository.save(user);

    return {
      message: 'Password has been successfully updated.',
    };
  }

  private generateToken(user: User) {
    const payload = {
      sub: user.id,
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
      },
    };
  }
}
