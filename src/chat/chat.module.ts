import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';

import { ChatGateway } from './chat.gateway';

import { NotificationsModule } from '../notifications/notifications.module';
import { MessageDeliveryProcessor } from './message-delivery.processor';

import { Conversation } from './entities/conversation.entity';
import { ConversationParticipant } from './entities/conversation-participant.entity';
import { DirectConversation } from './entities/direct-conversation.entity';
import { Message } from './entities/message.entity';
import { MessageAttachment } from './entities/message-attachment.entity';
import { MessageDeliveryJob } from './entities/message-delivery-job.entity';
import { MessageReceipt } from './entities/message-receipt.entity';
import { UserPresence } from './entities/user-presence.entity';

import { User } from '../users/entities/user.entity';
import { Call } from '../calls/entities/call.entity';

import { PresenceModule } from '../presence/presence.module';
import { UserBlocksModule } from '../user-blocks/user-blocks.module';
import { WebinarModule } from '../webinar/webinar.module';
import { DeviceController } from 'src/devices/controllers/user-device.controller';
import { UserDevice } from 'src/devices/entities/user-device.entity';
import { UserDeviceService } from 'src/devices/services/user-device.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [
    AuthModule,
    PresenceModule,
    UserBlocksModule,
    WebinarModule,
    NotificationsModule,
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
  controllers: [ChatController, DeviceController],
  providers: [
    ChatService,

    UserDeviceService,
    ChatGateway,
    MessageDeliveryProcessor,
  ],
  exports: [ChatService, UserDeviceService, ChatGateway],
})
export class ChatModule {}
