import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AiTutorController } from './ai-tutor.controller';
import { AiTutorService } from './ai-tutor.service';
import { AiTutorLearnerProfile } from './entities/ai-tutor-learner-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([AiTutorLearnerProfile])],
  controllers: [AiTutorController],
  providers: [AiTutorService],
})
export class AiTutorModule {}
