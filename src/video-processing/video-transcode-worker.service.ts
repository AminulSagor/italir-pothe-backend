import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { promises as fileSystem } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import { hostname } from 'node:os';
import { spawn } from 'node:child_process';
import { DataSource, Repository } from 'typeorm';

import { File, FileUploadStatus } from 'src/files/entities/file.entity';
import {
  MediaAsset,
  MediaAssetStatus,
  MediaType,
  VideoTranscodeStatus,
} from 'src/files/entities/media-asset.entity';
import {
  VideoTranscodeJob,
  VideoTranscodeJobStatus,
} from 'src/files/entities/video-transcode-job.entity';
import { S3Service } from 'src/files/services/s3.service';

interface ProbeResult {
  width: number;
  height: number;
  durationSeconds: number;
  hasAudio: boolean;
}

interface Rendition {
  name: string;
  height: number;
  videoBitrateKbps: number;
  maxRateKbps: number;
  bufferSizeKbps: number;
  audioBitrateKbps: number;
}

const HLS_RENDITIONS: Rendition[] = [
  {
    name: '360p',
    height: 360,
    videoBitrateKbps: 700,
    maxRateKbps: 800,
    bufferSizeKbps: 1200,
    audioBitrateKbps: 96,
  },
  {
    name: '480p',
    height: 480,
    videoBitrateKbps: 1200,
    maxRateKbps: 1400,
    bufferSizeKbps: 2100,
    audioBitrateKbps: 128,
  },
  {
    name: '720p',
    height: 720,
    videoBitrateKbps: 2500,
    maxRateKbps: 2800,
    bufferSizeKbps: 4200,
    audioBitrateKbps: 128,
  },
  {
    name: '1080p',
    height: 1080,
    videoBitrateKbps: 5000,
    maxRateKbps: 5350,
    bufferSizeKbps: 7500,
    audioBitrateKbps: 160,
  },
];

@Injectable()
export class VideoTranscodeWorkerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(VideoTranscodeWorkerService.name);

  private readonly enabled: boolean;
  private readonly workerId: string;
  private readonly ffmpegPath: string;
  private readonly ffprobePath: string;
  private readonly workDirectory: string;
  private readonly hlsPrefix: string;
  private readonly segmentSeconds: number;
  private readonly pollIntervalMs: number;
  private readonly lockTimeoutMinutes: number;
  private readonly retryDelayMinutes: number;

  private stopped = false;

  constructor(
    @InjectRepository(File)
    private readonly fileRepository: Repository<File>,

    @InjectRepository(MediaAsset)
    private readonly mediaAssetRepository: Repository<MediaAsset>,

    @InjectRepository(VideoTranscodeJob)
    private readonly jobRepository: Repository<VideoTranscodeJob>,

    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
    private readonly s3Service: S3Service,
  ) {
    this.enabled =
      this.configService
        .get<string>('VIDEO_TRANSCODING_ENABLED')
        ?.trim()
        .toLowerCase() !== 'false';

    this.workerId =
      this.configService.get<string>('VIDEO_WORKER_ID')?.trim() ||
      `${hostname()}:${process.pid}`;

    this.ffmpegPath =
      this.configService.get<string>('FFMPEG_PATH')?.trim() || 'ffmpeg';

    this.ffprobePath =
      this.configService.get<string>('FFPROBE_PATH')?.trim() || 'ffprobe';

    this.workDirectory =
      this.configService.get<string>('VIDEO_WORK_DIRECTORY')?.trim() ||
      '/tmp/italir-pothe-video';

    this.hlsPrefix =
      this.configService
        .get<string>('VIDEO_HLS_STORAGE_PREFIX')
        ?.trim()
        .replace(/^\/+|\/+$/g, '') || 'italir-pothe/hls';

    this.segmentSeconds = this.getPositiveInteger(
      'VIDEO_HLS_SEGMENT_SECONDS',
      6,
    );

    this.pollIntervalMs = this.getPositiveInteger(
      'VIDEO_WORKER_POLL_INTERVAL_MS',
      5000,
    );

    this.lockTimeoutMinutes = this.getPositiveInteger(
      'VIDEO_WORKER_LOCK_TIMEOUT_MINUTES',
      360,
    );

    this.retryDelayMinutes = this.getPositiveInteger(
      'VIDEO_TRANSCODE_RETRY_DELAY_MINUTES',
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.warn('Video transcoding is disabled.');
      return;
    }

    await this.validateTranscodingBinaries();

    void this.runLoop();
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }

  private async runLoop(): Promise<void> {
    await fileSystem.mkdir(this.workDirectory, {
      recursive: true,
    });

    while (!this.stopped) {
      try {
        await this.recoverStaleJobs();

        const job = await this.claimNextJob();

        if (!job) {
          await this.delay(this.pollIntervalMs);
          continue;
        }

        await this.processJob(job);
      } catch (error) {
        this.logger.error(
          `Worker loop failure: ${this.getErrorMessage(error)}`,
        );

        await this.delay(this.pollIntervalMs);
      }
    }
  }

  private async recoverStaleJobs(): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE "video_transcode_jobs"
        SET
          "status" = 'pending',
          "availableAt" = now(),
          "lockedAt" = NULL,
          "lockedBy" = NULL,
          "updatedAt" = now()
        WHERE
          "status" = 'processing'
          AND "lockedAt" IS NOT NULL
          AND "lockedAt" < now() - ($1 * interval '1 minute')
      `,
      [this.lockTimeoutMinutes],
    );
  }

  private async claimNextJob(): Promise<VideoTranscodeJob | null> {
    const [returnedRows] = await this.dataSource.query<
      [VideoTranscodeJob[], number]
    >(
      `
      WITH candidate AS (
        SELECT "id"
        FROM "video_transcode_jobs"
        WHERE
          "status" = 'pending'
          AND "availableAt" <= now()
          AND "attempts" < "maxAttempts"
        ORDER BY "createdAt" ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE "video_transcode_jobs" AS job
      SET
        "status" = 'processing',
        "attempts" = job."attempts" + 1,
        "lockedAt" = now(),
        "lockedBy" = $1,
        "updatedAt" = now()
      FROM candidate
      WHERE job."id" = candidate."id"
      RETURNING
        job."id",
        job."mediaAssetId",
        job."sourceFileId",
        job."status",
        job."attempts",
        job."maxAttempts",
        job."availableAt",
        job."lockedAt",
        job."lockedBy",
        job."lastError",
        job."completedAt",
        job."createdAt",
        job."updatedAt"
    `,
      [this.workerId],
    );

    return returnedRows[0] ?? null;
  }

  private async processJob(job: VideoTranscodeJob): Promise<void> {
    const mediaAsset = await this.mediaAssetRepository.findOne({
      where: {
        id: job.mediaAssetId,
      },
    });

    const sourceFile = await this.fileRepository.findOne({
      where: {
        id: job.sourceFileId,
      },
    });

    if (
      !mediaAsset ||
      !sourceFile ||
      mediaAsset.status !== MediaAssetStatus.ACTIVE ||
      mediaAsset.mediaType !== MediaType.VIDEO ||
      sourceFile.uploadStatus !== FileUploadStatus.UPLOADED
    ) {
      await this.markJobFailed(
        job,
        mediaAsset,
        'Video source or media asset is unavailable.',
        false,
      );
      return;
    }

    mediaAsset.transcodeStatus = VideoTranscodeStatus.PROCESSING;
    mediaAsset.transcodeError = null;

    await this.mediaAssetRepository.save(mediaAsset);

    const jobDirectory = await fileSystem.mkdtemp(
      join(this.workDirectory, `${job.id}-`),
    );

    const sourceExtension = extname(sourceFile.originalName) || '.mp4';

    const sourcePath = join(jobDirectory, `source${sourceExtension}`);

    const outputDirectory = join(jobDirectory, 'hls');

    const generationId = randomUUID();

    const generationPrefix = [this.hlsPrefix, mediaAsset.id, generationId].join(
      '/',
    );

    try {
      this.logger.log(`Downloading source for job ${job.id}.`);

      await this.s3Service.downloadObjectToFile({
        storageKey: sourceFile.storageKey,
        destinationPath: sourcePath,
      });

      const probe = await this.probeVideo(sourcePath);
      const renditions = this.selectRenditions(probe.height);

      this.logger.log(
        `Transcoding ${job.id}: ${renditions
          .map((item) => item.name)
          .join(', ')}.`,
      );

      await this.runFfmpeg({
        sourcePath,
        outputDirectory,
        renditions,
        hasAudio: probe.hasAudio,
      });

      await this.uploadHlsDirectory({
        localDirectory: outputDirectory,
        storagePrefix: generationPrefix,
      });

      const masterKey = `${generationPrefix}/master.m3u8`;

      await this.s3Service.assertObjectExists(masterKey);

      await this.dataSource.transaction(async (manager) => {
        await manager.getRepository(MediaAsset).update(
          {
            id: mediaAsset.id,
          },
          {
            transcodeStatus: VideoTranscodeStatus.READY,
            hlsMasterKey: masterKey,
            hlsGenerationId: generationId,
            sourceWidth: probe.width,
            sourceHeight: probe.height,
            durationSeconds: Math.max(0, Math.ceil(probe.durationSeconds)),
            transcodeError: null,
            transcodedAt: new Date(),
          },
        );

        await manager.getRepository(VideoTranscodeJob).update(
          {
            id: job.id,
          },
          {
            status: VideoTranscodeJobStatus.COMPLETED,
            completedAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null,
          },
        );
      });

      this.logger.log(`Video job ${job.id} completed.`);
    } catch (error) {
      await this.s3Service
        .deletePrefix(`${generationPrefix}/`)
        .catch(() => undefined);

      await this.markJobFailed(
        job,
        mediaAsset,
        this.getErrorMessage(error),
        true,
      );
    } finally {
      await fileSystem.rm(jobDirectory, {
        recursive: true,
        force: true,
      });
    }
  }

  private async markJobFailed(
    job: VideoTranscodeJob,
    mediaAsset: MediaAsset | null,
    errorMessage: string,
    allowRetry: boolean,
  ): Promise<void> {
    const cleanedError = errorMessage.slice(0, 5000);

    const shouldRetry = allowRetry && job.attempts < job.maxAttempts;

    const nextAvailableAt = new Date(
      Date.now() + this.retryDelayMinutes * 60 * 1000,
    );

    await this.dataSource.transaction(async (manager) => {
      await manager.getRepository(VideoTranscodeJob).update(
        {
          id: job.id,
        },
        {
          status: shouldRetry
            ? VideoTranscodeJobStatus.PENDING
            : VideoTranscodeJobStatus.FAILED,
          availableAt: shouldRetry ? nextAvailableAt : job.availableAt,
          lockedAt: null,
          lockedBy: null,
          lastError: cleanedError,
        },
      );

      if (mediaAsset) {
        await manager.getRepository(MediaAsset).update(
          {
            id: mediaAsset.id,
          },
          {
            transcodeStatus: shouldRetry
              ? VideoTranscodeStatus.PENDING
              : VideoTranscodeStatus.FAILED,
            transcodeError: cleanedError,
          },
        );
      }
    });

    this.logger.error(`Video job ${job.id} failed: ${cleanedError}`);
  }

  private async probeVideo(sourcePath: string): Promise<ProbeResult> {
    const result = await this.runProcess(this.ffprobePath, [
      '-v',
      'error',
      '-show_streams',
      '-show_format',
      '-of',
      'json',
      sourcePath,
    ]);

    const parsed = JSON.parse(result.stdout) as {
      streams?: Array<{
        codec_type?: string;
        width?: number;
        height?: number;
        duration?: string;
      }>;
      format?: {
        duration?: string;
      };
    };

    const videoStream = parsed.streams?.find(
      (stream) => stream.codec_type === 'video',
    );

    if (!videoStream?.width || !videoStream.height) {
      throw new Error('ffprobe could not detect video dimensions.');
    }

    const hasAudio =
      parsed.streams?.some((stream) => stream.codec_type === 'audio') ?? false;

    const durationSeconds = Number(
      parsed.format?.duration ?? videoStream.duration ?? 0,
    );

    return {
      width: videoStream.width,
      height: videoStream.height,
      durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      hasAudio,
    };
  }

  private selectRenditions(sourceHeight: number): Rendition[] {
    const matchingRenditions = HLS_RENDITIONS.filter(
      (rendition) => rendition.height <= sourceHeight,
    );

    if (matchingRenditions.length > 0) {
      return matchingRenditions;
    }

    const evenHeight = Math.max(2, sourceHeight - (sourceHeight % 2));

    return [
      {
        name: `${evenHeight}p`,
        height: evenHeight,
        videoBitrateKbps: 500,
        maxRateKbps: 600,
        bufferSizeKbps: 900,
        audioBitrateKbps: 96,
      },
    ];
  }

  private async runFfmpeg(params: {
    sourcePath: string;
    outputDirectory: string;
    renditions: Rendition[];
    hasAudio: boolean;
  }): Promise<void> {
    await fileSystem.mkdir(params.outputDirectory, {
      recursive: true,
    });

    for (const rendition of params.renditions) {
      await fileSystem.mkdir(join(params.outputDirectory, rendition.name), {
        recursive: true,
      });
    }

    const splitOutputs = params.renditions
      .map((_, index) => `[v${index}source]`)
      .join('');

    const scaleFilters = params.renditions
      .map(
        (rendition, index) =>
          `[v${index}source]scale=w=-2:h=${rendition.height}:flags=lanczos[v${index}out]`,
      )
      .join(';');

    const filterComplex =
      `[0:v:0]split=${params.renditions.length}${splitOutputs};` + scaleFilters;

    const args: string[] = [
      '-y',
      '-hide_banner',
      '-i',
      params.sourcePath,
      '-filter_complex',
      filterComplex,
      '-map_metadata',
      '-1',
      '-map_chapters',
      '-1',
    ];

    params.renditions.forEach((_, index) => {
      args.push('-map', `[v${index}out]`);

      if (params.hasAudio) {
        args.push('-map', '0:a:0');
      }
    });

    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-profile:v',
      'main',
      '-pix_fmt',
      'yuv420p',
      '-sc_threshold',
      '0',
      '-force_key_frames',
      `expr:gte(t,n_forced*${this.segmentSeconds})`,
    );

    params.renditions.forEach((rendition, index) => {
      args.push(
        `-b:v:${index}`,
        `${rendition.videoBitrateKbps}k`,
        `-maxrate:v:${index}`,
        `${rendition.maxRateKbps}k`,
        `-bufsize:v:${index}`,
        `${rendition.bufferSizeKbps}k`,
      );
    });

    if (params.hasAudio) {
      args.push('-c:a', 'aac', '-ar', '48000', '-ac', '2');

      params.renditions.forEach((rendition, index) => {
        args.push(`-b:a:${index}`, `${rendition.audioBitrateKbps}k`);
      });
    }

    const variantStreamMap = params.renditions
      .map((rendition, index) =>
        params.hasAudio
          ? `v:${index},a:${index},name:${rendition.name}`
          : `v:${index},name:${rendition.name}`,
      )
      .join(' ');

    args.push(
      '-sn',
      '-dn',
      '-f',
      'hls',
      '-hls_time',
      String(this.segmentSeconds),
      '-hls_playlist_type',
      'vod',
      '-hls_flags',
      'independent_segments',
      '-hls_segment_filename',
      join(params.outputDirectory, '%v', 'segment_%06d.ts'),
      '-master_pl_name',
      'master.m3u8',
      '-var_stream_map',
      variantStreamMap,
      join(params.outputDirectory, '%v', 'index.m3u8'),
    );

    await this.runProcess(this.ffmpegPath, args);
  }

  private async uploadHlsDirectory(params: {
    localDirectory: string;
    storagePrefix: string;
  }): Promise<void> {
    const files = await this.collectFiles(params.localDirectory);

    files.sort((left, right) => {
      const leftIsMaster = basename(left) === 'master.m3u8';
      const rightIsMaster = basename(right) === 'master.m3u8';

      if (leftIsMaster === rightIsMaster) {
        return left.localeCompare(right);
      }

      return leftIsMaster ? 1 : -1;
    });

    for (const localPath of files) {
      const relativePath = relative(params.localDirectory, localPath)
        .split(sep)
        .join('/');

      const storageKey = `${params.storagePrefix}/${relativePath}`;

      await this.s3Service.uploadLocalFile({
        storageKey,
        localPath,
        mimeType: this.getHlsContentType(localPath),
        cacheControl: 'public, max-age=31536000, immutable',
      });
    }
  }

  private async collectFiles(directory: string): Promise<string[]> {
    const entries = await fileSystem.readdir(directory, {
      withFileTypes: true,
    });

    const files: string[] = [];

    for (const entry of entries) {
      const fullPath = join(directory, entry.name);

      if (entry.isDirectory()) {
        files.push(...(await this.collectFiles(fullPath)));
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }

    return files;
  }

  private getHlsContentType(filePath: string): string {
    const extension = extname(filePath).toLowerCase();

    if (extension === '.m3u8') {
      return 'application/vnd.apple.mpegurl';
    }

    if (extension === '.ts') {
      return 'video/mp2t';
    }

    return 'application/octet-stream';
  }

  private runProcess(
    command: string,
    args: string[],
  ): Promise<{
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk: Buffer) => {
        stdout = this.appendLimited(stdout, chunk.toString());
      });

      child.stderr.on('data', (chunk: Buffer) => {
        stderr = this.appendLimited(stderr, chunk.toString());
      });

      child.once('error', reject);

      child.once('close', (exitCode) => {
        if (exitCode === 0) {
          resolve({
            stdout,
            stderr,
          });
          return;
        }

        reject(new Error(`${command} exited with code ${exitCode}: ${stderr}`));
      });
    });
  }

  private async validateTranscodingBinaries(): Promise<void> {
    await this.validateBinary('ffmpeg', 'FFMPEG_PATH', this.ffmpegPath);
    await this.validateBinary('ffprobe', 'FFPROBE_PATH', this.ffprobePath);
  }

  private async validateBinary(
    binaryName: string,
    environmentName: string,
    binaryPath: string,
  ): Promise<void> {
    try {
      const result = await this.runProcess(binaryPath, ['-version']);
      const versionLine = (result.stdout || result.stderr)
        .split(/\r?\n/, 1)[0]
        ?.trim();

      this.logger.log(
        `${binaryName} available at "${binaryPath}"${
          versionLine ? ` (${versionLine})` : ''
        }.`,
      );
    } catch (error) {
      const message = this.getErrorMessage(error);

      this.logger.error(
        `${binaryName} is unavailable at "${binaryPath}". Install it or set ${environmentName} to an executable path. ${message}`,
      );

      throw new Error(
        `Video worker cannot start because ${binaryName} is unavailable.`,
        { cause: error },
      );
    }
  }

  private appendLimited(current: string, addition: string): string {
    const combined = current + addition;
    const maximumLength = 1_000_000;

    return combined.length > maximumLength
      ? combined.slice(-maximumLength)
      : combined;
  }

  private getPositiveInteger(
    environmentName: string,
    fallbackValue: number,
  ): number {
    const configuredValue = this.configService
      .get<string>(environmentName)
      ?.trim();

    if (!configuredValue) {
      return fallbackValue;
    }

    const parsedValue = Number(configuredValue);

    if (!Number.isSafeInteger(parsedValue) || parsedValue <= 0) {
      throw new Error(`${environmentName} must be a positive integer.`);
    }

    return parsedValue;
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
