import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { User } from '../users/entities/user.entity';
import { JwtStrategy } from './jwt.strategy';
import { SmsService } from '../common/services/sms.service';
import { EmailService } from '../common/services/email.service';
import { Otp } from 'src/users/entities/otp.entity';
import { PackageStoreModule } from 'src/package-store/package-store.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Otp]),
    PassportModule,
    PackageStoreModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        // Add the "!" here
        secret: configService.get<string>('JWT_SECRET')!,
        signOptions: {
          // Cast to 'any' to satisfy the strict StringValue type constraint
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') as any,
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, SmsService, EmailService],
  exports: [JwtStrategy, PassportModule],
})
export class AuthModule {}
