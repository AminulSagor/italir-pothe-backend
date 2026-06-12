import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt } from 'crypto';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import { EmailService } from '../notifications/email.service';
import { SmsService } from '../notifications/sms.service';

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
import { Otp, OtpPurpose } from './entities/otp.entity';
import { User, UserRole } from './entities/user.entity';
import { UserPresence } from '../chat/entities/user-presence.entity';
import { PresenceStatus } from '../chat/enums/chat.enums';
import { PresenceService } from '../presence/presence.service';
import { FilesService } from 'src/files/services/files.service';
import { FilePurpose } from 'src/files/entities/file.entity';

@Injectable()
export class UsersService {
  private readonly otpExpiryMinutes = 10;
  private readonly maxOtpAttempts = 5;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Otp)
    private otpRepository: Repository<Otp>,
    private presenceService: PresenceService,
    private smsService: SmsService,
    private emailService: EmailService,
    private filesService: FilesService,
    private configService: ConfigService,
  ) {}

  async findByEmail(email: string) {
    return this.userRepository.findOne({ where: { email } });
  }

  async findAllUsersWithPresence() {
    const users = await this.userRepository.find();
    
    return Promise.all(
      users.map(async (user) => {
        const presence = await this.presenceService.getUserPresence(user.id);
        return {
          id: user.id,
          fullName: user.fullName,
          email: user.email,
          phone: user.phone,
          role: user.role,
          isVerified: user.isVerified,
          isOnline: presence.isOnline,
          lastSeenAt: presence.lastSeenAt,
        };
      }),
    );
  }

  async getMyProfile(userId: string) {
    const user = await this.findUserById(userId);

    return {
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
      createdAt: user.createdAt,
    };
  }

  async updateMyName(userId: string, dto: UpdateProfileNameDto) {
    const user = await this.findUserById(userId);

    user.fullName = dto.fullName.trim();

    await this.userRepository.save(user);

    return {
      message: 'Name updated successfully.',
      user: await this.getMyProfile(user.id),
    };
  }

  async requestEmailChangeOtp(userId: string, dto: RequestEmailChangeOtpDto) {
    const user = await this.findUserById(userId);
    const email = this.normalizeEmail(dto.email);

    if (user.email === email && user.isEmailVerified) {
      throw new BadRequestException('This email is already verified.');
    }

    await this.ensureEmailIsAvailable(email, user.id);

    const otpIdentifier = this.createProfileChangeOtpIdentifier(
      user.id,
      email,
      OtpPurpose.CHANGE_EMAIL,
    );

    const otp = await this.generateAndSaveOtp(
      otpIdentifier,
      OtpPurpose.CHANGE_EMAIL,
    );

    await this.emailService.sendOtpEmail(email, otp);

    return {
      message: 'Verification code sent to your new email.',
      email,
      ...this.getDevOtpResponse(otp),
    };
  }

  async verifyEmailChangeOtp(userId: string, dto: VerifyEmailChangeOtpDto) {
    const user = await this.findUserById(userId);
    const email = this.normalizeEmail(dto.email);

    await this.ensureEmailIsAvailable(email, user.id);

    const otpIdentifier = this.createProfileChangeOtpIdentifier(
      user.id,
      email,
      OtpPurpose.CHANGE_EMAIL,
    );

    await this.validateAndConsumeOtp(
      otpIdentifier,
      dto.otp,
      OtpPurpose.CHANGE_EMAIL,
    );

    user.email = email;
    user.isEmailVerified = true;
    user.isVerified = true;

    await this.userRepository.save(user);

    return {
      message: 'Email updated successfully.',
      user: await this.getMyProfile(user.id),
    };
  }

  async requestPhoneChangeOtp(userId: string, dto: RequestPhoneChangeOtpDto) {
    const user = await this.findUserById(userId);
    const phone = dto.phone.trim();

    if (user.phone === phone && user.isPhoneVerified) {
      throw new BadRequestException('This phone number is already verified.');
    }

    await this.ensurePhoneIsAvailable(phone, user.id);

    const otpIdentifier = this.createProfileChangeOtpIdentifier(
      user.id,
      phone,
      OtpPurpose.CHANGE_PHONE,
    );

    const otp = await this.generateAndSaveOtp(
      otpIdentifier,
      OtpPurpose.CHANGE_PHONE,
    );

    await this.smsService.sendOtp(phone, otp);

    return {
      message: 'Verification code sent to your new phone number.',
      phone,
      ...this.getDevOtpResponse(otp),
    };
  }

  async verifyPhoneChangeOtp(userId: string, dto: VerifyPhoneChangeOtpDto) {
    const user = await this.findUserById(userId);
    const phone = dto.phone.trim();

    await this.ensurePhoneIsAvailable(phone, user.id);

    const otpIdentifier = this.createProfileChangeOtpIdentifier(
      user.id,
      phone,
      OtpPurpose.CHANGE_PHONE,
    );

    await this.validateAndConsumeOtp(
      otpIdentifier,
      dto.otp,
      OtpPurpose.CHANGE_PHONE,
    );

    user.phone = phone;
    user.isPhoneVerified = true;
    user.isVerified = true;

    await this.userRepository.save(user);

    return {
      message: 'Phone number updated successfully.',
      user: await this.getMyProfile(user.id),
    };
  }

  async updateMyProfilePhoto(userId: string, dto: UpdateProfilePhotoDto) {
    const user = await this.findUserById(userId);
    const file = await this.filesService.findActiveFileById(
      dto.profilePhotoFileId,
    );

    if (file.filePurpose !== FilePurpose.PROFILE_AVATAR) {
      throw new BadRequestException(
        'Profile photo must be uploaded with profile_avatar purpose.',
      );
    }

    if (!file.mimeType.startsWith('image/')) {
      throw new BadRequestException('Profile photo must be an image file.');
    }

    user.profilePhotoFileId = file.id;

    await this.userRepository.save(user);

    return {
      message: 'Profile photo updated successfully.',
      user: await this.getMyProfile(user.id),
    };
  }

  async updateMyPreferences(userId: string, dto: UpdateUserPreferencesDto) {
    const user = await this.findUserById(userId);

    if (typeof dto.hapticsEnabled === 'boolean') {
      user.hapticsEnabled = dto.hapticsEnabled;
    }

    await this.userRepository.save(user);

    return {
      message: 'Preferences updated successfully.',
      user: await this.getMyProfile(user.id),
    };
  }

  async changeMyPassword(userId: string, dto: ChangePasswordDto) {
    const user = await this.findUserById(userId);

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'New password and confirm password do not match.',
      );
    }

    const isCurrentPasswordValid = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect.');
    }

    const isSamePassword = await bcrypt.compare(dto.newPassword, user.password);

    if (isSamePassword) {
      throw new BadRequestException(
        'New password must be different from current password.',
      );
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);

    await this.userRepository.save(user);

    return {
      message: 'Password changed successfully.',
    };
  }

  async deleteMyAccount(userId: string) {
    const user = await this.findUserById(userId);

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'Admin accounts cannot be deleted from user settings.',
      );
    }

    await this.userRepository.remove(user);

    return {
      message: 'Account deleted successfully.',
    };
  }

  async deleteUser(id: string) {
    const user = await this.userRepository.findOne({ where: { id } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.role !== UserRole.USER) {
      throw new BadRequestException(
        'This ID does not belong to a standard user',
      );
    }

    await this.userRepository.remove(user);

    return {
      message: 'User deleted successfully',
    };
  }

  async deleteAdmin(id: string) {
    const admin = await this.userRepository.findOne({ where: { id } });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    if (admin.role !== UserRole.ADMIN) {
      throw new BadRequestException('This ID does not belong to an admin');
    }

    const adminCount = await this.userRepository.count({
      where: { role: UserRole.ADMIN },
    });

    if (adminCount <= 1) {
      throw new BadRequestException('Cannot delete the last remaining admin');
    }

    await this.userRepository.remove(admin);

    return {
      message: 'Admin deleted successfully',
    };
  }

  private async findUserById(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private async ensureEmailIsAvailable(
    email: string,
    currentUserId: string,
  ): Promise<void> {
    const existingUser = await this.userRepository.findOne({
      where: {
        email,
      },
    });

    if (existingUser && existingUser.id !== currentUserId) {
      throw new ConflictException('Email is already in use.');
    }
  }

  private async ensurePhoneIsAvailable(
    phone: string,
    currentUserId: string,
  ): Promise<void> {
    const existingUser = await this.userRepository.findOne({
      where: {
        phone,
      },
    });

    if (existingUser && existingUser.id !== currentUserId) {
      throw new ConflictException('Phone number is already in use.');
    }
  }

  private createProfileChangeOtpIdentifier(
    userId: string,
    targetIdentifier: string,
    purpose: OtpPurpose.CHANGE_EMAIL | OtpPurpose.CHANGE_PHONE,
  ): string {
    return `${purpose}:${userId}:${targetIdentifier}`;
  }

  private async generateAndSaveOtp(
    identifier: string,
    purpose: OtpPurpose,
  ): Promise<string> {
    await this.otpRepository.delete({
      identifier,
      purpose,
    });

    const code = randomInt(1000, 10000).toString();
    const codeHash = await bcrypt.hash(code, 10);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.otpExpiryMinutes);

    const otpRecord = this.otpRepository.create({
      identifier,
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
    const otpRecord = await this.otpRepository.findOne({
      where: {
        identifier,
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
}
