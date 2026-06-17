import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PresenceService } from './presence.service';
import { PresenceController } from './presence.controller';
import { UserPresence } from '../chat/entities/user-presence.entity';

@Module({
  imports: [TypeOrmModule.forFeature([UserPresence])],
  controllers: [PresenceController],
  providers: [PresenceService],
  exports: [PresenceService],
})
export class PresenceModule {}
