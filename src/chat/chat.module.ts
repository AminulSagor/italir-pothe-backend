import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';

import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
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
import { User } from '../users/entities/user.entity';
import { PresenceModule } from '../presence/presence.module';
import { UserBlocksModule } from '../user-blocks/user-blocks.module';

@Module({
  imports: [
    PresenceModule,
    UserBlocksModule,
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
  controllers: [ChatController],
  providers: [ChatService, ChatGateway, MessageDeliveryProcessor],
  exports: [ChatService],
})
export class ChatModule {}
