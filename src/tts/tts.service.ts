import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { FilePurpose } from 'src/files/entities/file.entity';
import {
  FileRequestUser,
  FilesService,
} from 'src/files/services/files.service';

const execFileAsync = promisify(execFile);

@Injectable()
export class TtsService {
  constructor(
    private readonly configService: ConfigService,
    private readonly filesService: FilesService,
  ) {}

  async generateQuizAudio(text: string, currentUser: FileRequestUser) {
    const normalizedText = text.trim();

    const python =
      this.configService.get<string>('PIPER_PYTHON')?.trim() || 'python3';

    const voice =
      this.configService.get<string>('PIPER_VOICE')?.trim() ||
      'it_IT-paola-medium';

    const dataDir = this.configService.get<string>('PIPER_DATA_DIR')?.trim();

    if (!dataDir) {
      throw new InternalServerErrorException(
        'PIPER_DATA_DIR is not configured',
      );
    }

    const tempDirectory = await mkdtemp(join(tmpdir(), 'italir-tts-'));

    const outputPath = join(tempDirectory, 'generated.wav');

    try {
      await execFileAsync(
        python,
        [
          '-m',
          'piper',
          '--data-dir',
          dataDir,
          '-m',
          voice,
          '-f',
          outputPath,
          '--',
          normalizedText,
        ],
        {
          timeout: 60_000,
        },
      );

      const audioBuffer = await readFile(outputPath);

      if (!audioBuffer.length) {
        throw new Error('Generated audio is empty');
      }

      // Reuse YOUR existing S3/files implementation.
      const result = await this.filesService.createFileFromBuffer(
        audioBuffer,
        `quiz-tts-${Date.now()}.wav`,
        'audio/wav',
        currentUser,
        FilePurpose.QUIZ_AUDIO,
      );

      return {
        mediaFileId: result.file.id,
      };
    } catch (error) {
      console.error('TTS generation failed:', error);

      throw new InternalServerErrorException('Unable to generate audio');
    } finally {
      await rm(tempDirectory, {
        recursive: true,
        force: true,
      });
    }
  }
}
