import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { File } from 'src/files/entities/file.entity';
import { FilesModule } from 'src/files/files.module';
import { User } from 'src/users/entities/user.entity';
import { AdminWebinarsController } from './controllers/admin-webinars.controller';
import { WebinarsController } from './controllers/webinars.controller';
import { WebinarAudienceCourse } from './entities/webinar-audience-course.entity';
import { WebinarParticipant } from './entities/webinar-participant.entity';
import { WebinarSpeakerRequest } from './entities/webinar-speaker-request.entity';
import { Webinar } from './entities/webinar.entity';
import { WebinarGateway } from './gateways/webinar.gateway';
import { AgoraTokenService } from './services/agora-token.service';
import { WebinarsService } from './services/webinars.service';

@Module({
  imports: [
    FilesModule,
    TypeOrmModule.forFeature([
      Webinar,
      WebinarAudienceCourse,
      WebinarParticipant,
      WebinarSpeakerRequest,
      User,
      File,
    ]),
  ],
  controllers: [AdminWebinarsController, WebinarsController],
  providers: [WebinarsService, AgoraTokenService, WebinarGateway],
  exports: [WebinarsService],
})
export class WebinarModule {}
