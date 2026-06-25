import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiTutorLearnerProfile } from '../ai-tutor/entities/ai-tutor-learner-profile.entity';
import { UserDevice } from '../devices/entities/user-device.entity';
import { FilesModule } from '../files/files.module';
import { UserStreak } from '../module-2/scoring/entities/user-streak.entity';
import { User } from '../users/entities/user.entity';
import { UsersModule } from '../users/users.module';
import { UserSettingsController } from './user-settings.controller';
import { UserSettingsService } from './user-settings.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserStreak,
      AiTutorLearnerProfile,
      UserDevice,
    ]),
    UsersModule,
    FilesModule,
  ],
  controllers: [UserSettingsController],
  providers: [UserSettingsService],
  exports: [UserSettingsService],
})
export class UserSettingsModule {}
