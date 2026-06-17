import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { CallController } from './controllers/call.controller';
import { DeviceController } from './controllers/device.controller';

import { ChatGateway } from './chat.gateway';
import { CallService } from './services/call.service';
import { UserDeviceService } from './services/user-device.service';
import { FirebasePushService } from '../notifications/firebase-push.service';
import { MessageDeliveryProcessor } from './message-delivery.processor';

import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { DirectConversation } from './entities/direct-conversation.entity';
import { Message } from './entities/message.entity';
import { MessageAttachment } from './entities/message-attachment.entity';
import { MessageDeliveryJob } from './entities/message-delivery-job.entity';
import { MessageReceipt } from './entities/message-receipt.entity';
import { UserDevice } from './entities/user-device.entity';
import { UserPresence } from './entities/user-presence.entity';
import { Call } from './entities/call.entity';
import { User } from '../users/entities/user.entity';

import { PresenceModule } from '../presence/presence.module';
import { UserBlocksModule } from '../user-blocks/user-blocks.module';
import { WebinarModule } from '../webinar/webinar.module';

@Module({
  imports: [
    PresenceModule,
    UserBlocksModule,
    WebinarModule,
    TypeOrmModule.forFeature([
      Conversation,
      ConversationParticipant,
      DirectConversation,
      Message,
      MessageAttachment,
      MessageDeliveryJob,
      MessageReceipt,
      UserDevice,
      UserPresence,
      Call,
      User,
    ]),
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET')!,
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN') as any,
        },
      }),
    }),
  ],
  controllers: [ChatController, CallController, DeviceController],
  providers: [
    ChatService,
    CallService,
    UserDeviceService,
    FirebasePushService,
    ChatGateway,
    MessageDeliveryProcessor,
  ],
  exports: [ChatService, CallService, UserDeviceService, FirebasePushService],
})
export class ChatModule {}
