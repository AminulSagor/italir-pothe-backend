import { Module } from '@nestjs/common';

import { AiTutorController } from './ai-tutor.controller';
import { AiTutorService } from './ai-tutor.service';

@Module({
  controllers: [AiTutorController],
  providers: [AiTutorService],
})
export class AiTutorModule {}
