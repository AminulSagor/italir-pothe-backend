import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';

import { AiTutorLearnerProfile } from '../ai-tutor/entities/ai-tutor-learner-profile.entity';
import { FilePurpose, FileVisibility } from '../files/entities/file.entity';
import { FilesService } from '../files/services/files.service';
import { S3Service } from '../files/services/s3.service';
import { UserStreak } from '../module-2/scoring/entities/user-streak.entity';
import {
  RequestEmailChangeOtpDto,
  RequestPhoneChangeOtpDto,
  VerifyEmailChangeOtpDto,
  VerifyPhoneChangeOtpDto,
} from '../users/dto/user-profile.dto';
import { User, UserRole } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ChangeUserPasswordDto } from './dto/change-user-password.dto';
import { ConfirmAvatarUploadDto } from './dto/confirm-avatar-upload.dto';
import { DeleteUserAccountDto } from './dto/delete-user-account.dto';
import { PrepareAvatarUploadDto } from './dto/prepare-avatar-upload.dto';
import { UpdateFullNameDto } from './dto/update-full-name.dto';
import {
  AvatarUploadPreparationResponse,
  ContactChangeOtpResponse,
  UserSettingsMessageResponse,
  UserSettingsProfilePayload,
  UserSettingsProfileResponse,
} from './types/user-settings.types';
import { UserAccountDeletionService } from 'src/users/user-account-deletion.service';
import { UserDeletionSource } from 'src/users/entities/deleted-user-audit.entity';

@Injectable()
export class UserSettingsService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(UserStreak)
    private readonly userStreakRepository: Repository<UserStreak>,
    @InjectRepository(AiTutorLearnerProfile)
    private readonly learnerProfileRepository: Repository<AiTutorLearnerProfile>,
    private readonly userAccountDeletionService: UserAccountDeletionService,
    private readonly usersService: UsersService,
    private readonly filesService: FilesService,
    private readonly s3Service: S3Service,
  ) {}

  async getProfile(userId: string): Promise<UserSettingsProfileResponse> {
    const user = await this.findUser(userId);
    return { profile: await this.toProfilePayload(user) };
  }

  async updateFullName(
    userId: string,
    dto: UpdateFullNameDto,
  ): Promise<UserSettingsProfileResponse> {
    const user = await this.findUser(userId);
    const fullName = dto.fullName.trim();

    user.fullName = fullName;
    user.name = fullName;
    await this.userRepository.save(user);

    return {
      message: 'Full name updated successfully.',
      profile: await this.toProfilePayload(user),
    };
  }

  async requestEmailChangeOtp(
    userId: string,
    dto: RequestEmailChangeOtpDto,
  ): Promise<ContactChangeOtpResponse> {
    const result = await this.usersService.requestEmailChangeOtp(userId, dto);

    return {
      message: result.message,
      contactType: 'email',
      destination: result.email,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    };
  }

  async verifyEmailChangeOtp(
    userId: string,
    dto: VerifyEmailChangeOtpDto,
  ): Promise<UserSettingsProfileResponse> {
    const result = await this.usersService.verifyEmailChangeOtp(userId, dto);
    const profile = await this.getProfile(userId);

    return {
      message: result.message,
      profile: profile.profile,
    };
  }

  async requestPhoneChangeOtp(
    userId: string,
    dto: RequestPhoneChangeOtpDto,
  ): Promise<ContactChangeOtpResponse> {
    const result = await this.usersService.requestPhoneChangeOtp(userId, dto);

    return {
      message: result.message,
      contactType: 'phone',
      destination: result.phone,
      ...(result.devOtp ? { devOtp: result.devOtp } : {}),
    };
  }

  async verifyPhoneChangeOtp(
    userId: string,
    dto: VerifyPhoneChangeOtpDto,
  ): Promise<UserSettingsProfileResponse> {
    const result = await this.usersService.verifyPhoneChangeOtp(userId, dto);
    const profile = await this.getProfile(userId);

    return {
      message: result.message,
      profile: profile.profile,
    };
  }

  async prepareAvatarUpload(
    dto: PrepareAvatarUploadDto,
  ): Promise<AvatarUploadPreparationResponse> {
    return this.filesService.createSignedUploadUrl({
      originalName: dto.originalName.trim(),
      mimeType: dto.mimeType.trim().toLowerCase(),
      sizeBytes: dto.sizeBytes,
      filePurpose: FilePurpose.PROFILE_AVATAR,
      visibility: FileVisibility.PUBLIC,
    });
  }

  async confirmAvatarUpload(
    userId: string,
    userRole: string,
    dto: ConfirmAvatarUploadDto,
  ): Promise<UserSettingsProfileResponse> {
    const user = await this.findUser(userId);
    const confirmed = await this.filesService.confirmUpload(
      {
        storageKey: dto.storageKey.trim(),
        originalName: dto.originalName.trim(),
        mimeType: dto.mimeType.trim().toLowerCase(),
        sizeBytes: dto.sizeBytes,
        filePurpose: FilePurpose.PROFILE_AVATAR,
        visibility: FileVisibility.PUBLIC,
        title: dto.originalName.trim(),
      },
      { id: userId, role: userRole },
    );

    const file = confirmed.file;

    if (file.ownerUserId !== userId) {
      throw new ForbiddenException(
        'The uploaded avatar does not belong to you.',
      );
    }

    if (file.filePurpose !== FilePurpose.PROFILE_AVATAR) {
      throw new BadRequestException('Invalid avatar file purpose.');
    }

    if (!file.mimeType.startsWith('image/')) {
      throw new BadRequestException('Avatar must be an image file.');
    }

    user.profilePhotoFileId = file.id;
    user.avatarUrl = this.s3Service.createPublicUrl(file.storageKey);
    await this.userRepository.save(user);

    return {
      message: 'Profile photo updated successfully.',
      profile: await this.toProfilePayload(user),
    };
  }

  async changePassword(
    userId: string,
    dto: ChangeUserPasswordDto,
  ): Promise<UserSettingsMessageResponse> {
    const user = await this.findUser(userId);

    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException(
        'New password and confirm password do not match.',
      );
    }

    const currentPasswordMatches = await bcrypt.compare(
      dto.currentPassword,
      user.password,
    );

    if (!currentPasswordMatches) {
      throw new BadRequestException('Current password is incorrect.');
    }

    const reusesCurrentPassword = await bcrypt.compare(
      dto.newPassword,
      user.password,
    );

    if (reusesCurrentPassword) {
      throw new BadRequestException(
        'New password must be different from current password.',
      );
    }

    user.password = await bcrypt.hash(dto.newPassword, 10);
    await this.userRepository.save(user);

    return { message: 'Password changed successfully.' };
  }

  async deleteAccount(
    userId: string,
    dto: DeleteUserAccountDto,
  ): Promise<UserSettingsMessageResponse> {
    const user = await this.findUser(userId);

    if (
      this.normalizeFullName(dto.fullName) !==
      this.normalizeFullName(user.fullName)
    ) {
      throw new BadRequestException(
        'The entered full name does not match your account.',
      );
    }

    if (user.role === UserRole.ADMIN) {
      throw new BadRequestException(
        'Admin accounts cannot be deleted from user settings.',
      );
    }

    return this.userAccountDeletionService.deleteAccount({
      targetUserId: user.id,

      deletedByUserId: user.id,

      source: UserDeletionSource.SELF_SERVICE,

      expectedRole: user.role,
    });
  }

  private async findUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id: userId } });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async toProfilePayload(
    user: User,
  ): Promise<UserSettingsProfilePayload> {
    const [streak, learnerProfile] = await Promise.all([
      this.userStreakRepository.findOne({ where: { userId: user.id } }),
      this.learnerProfileRepository.findOne({ where: { userId: user.id } }),
    ]);

    let avatarUrl = user.avatarUrl;

    if (!avatarUrl && user.profilePhotoFileId) {
      try {
        const file = await this.filesService.findActiveFileById(
          user.profilePhotoFileId,
        );

        if (file.visibility === FileVisibility.PUBLIC) {
          avatarUrl = this.s3Service.createPublicUrl(file.storageKey);
        } else {
          const signed = await this.filesService.createSignedReadUrl(file.id);
          avatarUrl = signed.signedReadUrl;
        }
      } catch {
        avatarUrl = null;
      }
    }

    return {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      isEmailVerified: user.isEmailVerified,
      isPhoneVerified: user.isPhoneVerified,
      profilePhotoFileId: user.profilePhotoFileId,
      avatarUrl,
      canChangeEmail: true,
      canChangePhone: true,
      streakFreezeCount: Math.max(0, streak?.streakFreezeCount ?? 0),
      currentStreakDays: Math.max(0, streak?.currentDays ?? 0),
      learnerLevel: learnerProfile?.finalLevel?.trim() || 'A1',
    };
  }

  private normalizeFullName(value: string): string {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }
}
