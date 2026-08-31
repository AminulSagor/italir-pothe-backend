import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

import { User } from '../users/entities/user.entity';
import { Otp } from '../users/entities/otp.entity';
import { ModerationAction } from '../moderation/entities/moderation-action.entity';

import { SmsService } from '../common/services/sms.service';
import { MailModule } from '../common/mail/mail.module';
import { PackageStoreModule } from '../package-store/package-store.module';
import { DevicesModule } from '../devices/devices.module';
import { AccountModerationStatusService } from '../moderation/account-moderation-status.service';
import { SessionSocketRegistryService } from './session-socket-registry.service';
import { UserSocialAccount } from './entities/user-social-account.entity';
import { SocialTokenVerifierService } from './social-token-verifier.service';
import { AppleSignInTokenModule } from './apple-sign-in-token.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Otp, ModerationAction, UserSocialAccount]),

    ConfigModule,
    PassportModule,
    PackageStoreModule,
    MailModule,

    // Provides UserDeviceService for login-session validation.
    DevicesModule,
    AppleSignInTokenModule,

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const jwtSecret = configService.get<string>('JWT_SECRET');

        if (!jwtSecret?.trim()) {
          throw new Error('JWT_SECRET is missing from environment variables');
        }

        return {
          secret: jwtSecret.trim(),
          signOptions: {
            expiresIn: (configService.get<string>('JWT_EXPIRES_IN') ??
              '7d') as any,
          },
        };
      },
    }),
  ],

  controllers: [AuthController],

  providers: [
    AuthService,
    JwtStrategy,
    SmsService,
    AccountModerationStatusService,
    SocialTokenVerifierService,

    // Tracks socket connections by authentication session.
    SessionSocketRegistryService,
  ],

  exports: [
    JwtStrategy,
    PassportModule,

    // Allows ChatModule and CallsModule to disconnect
    // sockets immediately when a session is revoked.
    SessionSocketRegistryService,
  ],
})
export class AuthModule {}
