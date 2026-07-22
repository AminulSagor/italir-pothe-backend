import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';

import * as bcrypt from 'bcrypt';
import { randomInt } from 'crypto';
import { Repository } from 'typeorm';

import { EmailService } from '../common/services/email.service';
import { SmsService } from '../common/services/sms.service';
import { UserAccountDeletionService } from '../users/user-account-deletion.service';
import { Otp, OtpPurpose } from '../users/entities/otp.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { UserDeletionSource } from '../users/entities/deleted-user-audit.entity';

import { ConfirmAccountDeletionDto } from './dto/confirm-account-deletion.dto';
import { RequestAccountDeletionOtpDto } from './dto/request-account-deletion-otp.dto';

@Injectable()
export class AccountDeletionService {
  private readonly otpExpiryMinutes = 10;
  private readonly otpRequestCooldownSeconds = 60;
  private readonly maximumOtpAttempts = 5;

  private readonly genericRequestMessage =
    'If an eligible account exists, a deletion verification code has been sent.';

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    @InjectRepository(Otp)
    private readonly otpRepository: Repository<Otp>,

    private readonly userAccountDeletionService: UserAccountDeletionService,

    private readonly emailService: EmailService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService,
  ) {}

  async requestDeletionOtp(dto: RequestAccountDeletionOtpDto) {
    /*
     * Silently ignore bots that fill the hidden website field.
     */
    if (dto.website?.trim()) {
      return {
        message: this.genericRequestMessage,
      };
    }

    const identifier = this.normalizeIdentifier(dto.identifier);

    const user = await this.findEligibleUser(identifier);

    /*
     * Do not reveal whether an account exists.
     */
    if (!user) {
      return {
        message: this.genericRequestMessage,
      };
    }

    const existingOtp = await this.otpRepository.findOne({
      where: {
        identifier,
        purpose: OtpPurpose.ACCOUNT_DELETION,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (existingOtp) {
      const secondsSinceLastRequest =
        (Date.now() - existingOtp.createdAt.getTime()) / 1000;

      if (secondsSinceLastRequest < this.otpRequestCooldownSeconds) {
        return {
          message: this.genericRequestMessage,
        };
      }
    }

    await this.otpRepository.delete({
      identifier,
      purpose: OtpPurpose.ACCOUNT_DELETION,
    });

    const otp = randomInt(100000, 1000000).toString();

    const codeHash = await bcrypt.hash(otp, 10);

    const expiresAt = new Date();

    expiresAt.setMinutes(expiresAt.getMinutes() + this.otpExpiryMinutes);

    const otpRecord = this.otpRepository.create({
      identifier,
      purpose: OtpPurpose.ACCOUNT_DELETION,
      code: codeHash,
      expiresAt,
      attemptCount: 0,
      resetTokenHash: null,
      resetTokenExpiresAt: null,
      verifiedAt: null,
    });

    await this.otpRepository.save(otpRecord);

    await this.sendOtp(identifier, otp);

    return {
      message: this.genericRequestMessage,
      ...this.getDevelopmentOtpResponse(identifier, otp),
    };
  }

  async confirmDeletion(dto: ConfirmAccountDeletionDto) {
    const identifier = this.normalizeIdentifier(dto.identifier);

    const user = await this.findEligibleUser(identifier);

    if (!user) {
      throw this.invalidOtpException();
    }

    await this.validateDeletionOtp(identifier, dto.otp);

    await this.userAccountDeletionService.deleteAccount({
      targetUserId: user.id,
      deletedByUserId: user.id,
      source: UserDeletionSource.SELF_SERVICE,
      expectedRole: UserRole.USER,
    });

    return {
      message: 'Your Italir Pothe account was deleted successfully.',
      deleted: true,
    };
  }

  private async validateDeletionOtp(
    identifier: string,
    submittedOtp: string,
  ): Promise<void> {
    const otpRecord = await this.otpRepository.findOne({
      where: {
        identifier,
        purpose: OtpPurpose.ACCOUNT_DELETION,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    if (!otpRecord?.code) {
      throw this.invalidOtpException();
    }

    if (otpRecord.expiresAt.getTime() <= Date.now()) {
      await this.otpRepository.delete({
        id: otpRecord.id,
      });

      throw this.invalidOtpException();
    }

    if (otpRecord.attemptCount >= this.maximumOtpAttempts) {
      await this.otpRepository.delete({
        id: otpRecord.id,
      });

      throw this.invalidOtpException();
    }

    const isOtpValid = await bcrypt.compare(submittedOtp, otpRecord.code);

    if (!isOtpValid) {
      otpRecord.attemptCount += 1;

      if (otpRecord.attemptCount >= this.maximumOtpAttempts) {
        await this.otpRepository.delete({
          id: otpRecord.id,
        });
      } else {
        await this.otpRepository.save(otpRecord);
      }

      throw this.invalidOtpException();
    }

    /*
     * Do not delete the OTP here.
     *
     * UserAccountDeletionService deletes all OTP records belonging
     * to the user inside the account-deletion transaction.
     */
  }

  private async findEligibleUser(identifier: string): Promise<User | null> {
    const user = await this.userRepository.findOne({
      where: this.isEmail(identifier)
        ? {
            email: identifier,
          }
        : {
            phone: identifier,
          },
    });

    /*
     * Public deletion must never delete admin or moderator accounts.
     */
    if (!user || user.role !== UserRole.USER) {
      return null;
    }

    return user;
  }

  private async sendOtp(identifier: string, otp: string): Promise<void> {
    if (this.isEmail(identifier)) {
      await this.emailService.sendOtpEmail(
        identifier,
        otp,
        OtpPurpose.ACCOUNT_DELETION,
      );

      return;
    }

    await this.smsService.sendOtp(identifier, otp, OtpPurpose.ACCOUNT_DELETION);
  }

  private normalizeIdentifier(identifier: string): string {
    const normalized = identifier.trim();

    return this.isEmail(normalized) ? normalized.toLowerCase() : normalized;
  }

  private isEmail(identifier: string): boolean {
    return identifier.includes('@');
  }

  private invalidOtpException() {
    return new BadRequestException(
      'The verification code is invalid or expired. Request a new code.',
    );
  }

  private getDevelopmentOtpResponse(
    identifier: string,
    otp: string,
  ): Record<string, string> {
    if (process.env.NODE_ENV === 'production') {
      return {};
    }

    const emailBypass =
      this.configService.get<string>('EMAIL_BYPASS')?.trim() === 'true';

    const smsBypass =
      this.configService.get<string>('SMS_BYPASS')?.trim() === 'true';

    const bypassEnabled = this.isEmail(identifier) ? emailBypass : smsBypass;

    return bypassEnabled
      ? {
          devOtp: otp,
        }
      : {};
  }
}
