import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { InjectRepository } from '@nestjs/typeorm';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Repository } from 'typeorm';

import { UserDeviceService } from '../devices/services/user-device.service';
import { AccountModerationStatusService } from '../moderation/account-moderation-status.service';
import { User, UserRole } from '../users/entities/user.entity';

export interface JwtPayload {
  /*
   * User ID stored inside the JWT.
   */
  sub?: string;
  id?: string;

  /*
   * PostgreSQL authentication-session ID.
   */
  sid?: string;

  /*
   * Stable application-installation/device ID.
   */
  did?: string;

  fullName?: string;
  email?: string | null;
  phone?: string | null;
  role?: UserRole | string;
}

export interface AuthenticatedUser {
  id: string;
  sub: string;

  /*
   * These values are later available through:
   *
   * request.user.sessionId
   * request.user.deviceId
   */
  sessionId: string;
  deviceId: string;

  fullName: string;
  email: string | null;
  phone: string | null;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,

    @InjectRepository(User)
    private readonly userRepository: Repository<User>,

    private readonly accountModerationStatusService: AccountModerationStatusService,

    private readonly userDeviceService: UserDeviceService,
  ) {
    const jwtSecret = configService.get<string>('JWT_SECRET')?.trim();

    if (!jwtSecret) {
      throw new Error('JWT_SECRET is missing from environment variables');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),

      /*
       * Passport automatically rejects an expired JWT.
       */
      ignoreExpiration: false,

      secretOrKey: jwtSecret,
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    /*
     * Step 1:
     * Read the user ID from the JWT.
     */
    const userId = payload.sub ?? payload.id;

    if (!userId?.trim()) {
      throw new UnauthorizedException('Invalid token payload');
    }

    /*
     * Step 2:
     * Read the PostgreSQL session information.
     *
     * Older JWTs without sid and did will be rejected,
     * requiring the user to log in again.
     */
    const sessionId = payload.sid?.trim();

    const deviceId = payload.did?.trim();

    if (!sessionId || !deviceId) {
      throw new UnauthorizedException(
        'Token does not contain an active authentication session',
      );
    }

    /*
     * Step 3:
     * Confirm that the session still exists and is active
     * in the user_devices PostgreSQL table.
     *
     * After logout, this check fails immediately, even when
     * someone still has a copied version of the JWT.
     */
    await this.userDeviceService.assertAuthSessionActive({
      userId,
      sessionId,
      deviceId,
    });

    /*
     * Step 4:
     * Confirm that the user still exists.
     */
    const user = await this.userRepository.findOne({
      where: {
        id: userId,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User account no longer exists');
    }

    /*
     * Step 5:
     * Block suspended, banned, deleted, or otherwise
     * restricted accounts.
     */
    await this.accountModerationStatusService.assertAccountIsActive(user);

    /*
     * Step 6:
     * Everything returned here becomes request.user
     * inside guarded controllers.
     */
    return {
      id: user.id,
      sub: user.id,

      sessionId,
      deviceId,

      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      role: user.role,
    };
  }
}
