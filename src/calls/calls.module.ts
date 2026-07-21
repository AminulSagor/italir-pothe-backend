import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DirectConversation } from '../chat/entities/direct-conversation.entity';
import { DevicesModule } from '../devices/devices.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { UserBlocksModule } from '../user-blocks/user-blocks.module';
import { User } from '../users/entities/user.entity';

import { CallsController } from './controllers/calls.controller';
import { Call } from './entities/call.entity';
import { CallsGateway } from './gateways/calls.gateway';
import { CallAgoraTokenService } from './services/call-agora-token.service';
import { CallOrchestratorService } from './services/call-orchestrator.service';
import { CallRealtimeService } from './services/call-realtime.service';
import { CallService } from './services/call.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    UserBlocksModule,
    DevicesModule,
    FirebaseModule,

    TypeOrmModule.forFeature([Call, DirectConversation, User]),

    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') as any,
        },
      }),
    }),
  ],

  controllers: [CallsController],

  providers: [
    CallsGateway,
    CallService,
    CallOrchestratorService,
    CallAgoraTokenService,
    CallRealtimeService,
  ],

  exports: [
    CallService,
    CallOrchestratorService,

    /*
     * Exported so another module, such as ModerationModule,
     * can disconnect a permanently banned user's call sockets.
     */
    CallRealtimeService,
  ],
})
export class CallsModule {}
