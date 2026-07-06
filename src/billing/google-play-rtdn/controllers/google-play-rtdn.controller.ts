import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { GooglePubSubPushDto } from '../dto/google-pubsub-push.dto';
import { GooglePlayRtdnAuthService } from '../services/google-play-rtdn-auth.service';
import { GooglePlayRtdnIngestionService } from '../services/google-play-rtdn-ingestion.service';

@Controller('billing')
export class GooglePlayRtdnController {
  constructor(
    private readonly authService: GooglePlayRtdnAuthService,

    private readonly ingestionService: GooglePlayRtdnIngestionService,
  ) {}

  @Post('google-play/rtdn')
  @HttpCode(HttpStatus.NO_CONTENT)
  async receive(
    @Headers('authorization')
    authorizationHeader: string | undefined,

    @Body()
    body: GooglePubSubPushDto,
  ): Promise<void> {
    await this.authService.assertAuthorized(authorizationHeader);

    await this.ingestionService.ingest(body);
  }
}
