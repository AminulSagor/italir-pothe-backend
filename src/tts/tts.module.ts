import { Module } from '@nestjs/common';

import { FilesModule } from 'src/files/files.module';

import { TtsController } from './tts.controller';
import { TtsService } from './tts.service';

@Module({
  imports: [FilesModule],
  controllers: [TtsController],
  providers: [TtsService],
})
export class TtsModule {}
