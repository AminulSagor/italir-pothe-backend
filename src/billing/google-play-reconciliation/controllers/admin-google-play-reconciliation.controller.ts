import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';

import {
  RetryGooglePlayFailuresDto,
  RunGooglePlayReconciliationDto,
} from '../dto/google-play-reconciliation.dto';
import { GooglePlayReconciliationService } from '../services/google-play-reconciliation.service';

import { GooglePlayRtdnProcessorService } from 'src/billing/google-play-rtdn/services/google-play-rtdn-processor.service';
import { UserRole } from 'src/users/entities/user.entity';

@Controller('admin/billing/google-play/reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminGooglePlayReconciliationController {
  constructor(
    private readonly reconciliationService: GooglePlayReconciliationService,

    private readonly rtdnProcessorService: GooglePlayRtdnProcessorService,
  ) {}

  @Get('status')
  async getStatus() {
    return this.reconciliationService.getStatus();
  }

  @Post('voided-purchases/run')
  async runVoidedPurchases(
    @Body()
    dto: RunGooglePlayReconciliationDto,
  ) {
    return this.reconciliationService.runReconciliation({
      startTime: dto.startTime ? new Date(dto.startTime) : undefined,

      endTime: dto.endTime ? new Date(dto.endTime) : undefined,

      maxPages: dto.maxPages,

      processLimit: dto.processLimit,
    });
  }

  @Post('voided-purchases/retry-failed')
  async retryFailedVoidedPurchases(
    @Body()
    dto: RetryGooglePlayFailuresDto,
  ) {
    return this.reconciliationService.retryFailedRecords({
      includeDeadLetter: dto.includeDeadLetter,

      limit: dto.limit,
    });
  }

  @Post('voided-purchases/:recordId/retry')
  async retryVoidedPurchase(
    @Param(
      'recordId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    recordId: string,
  ) {
    return this.reconciliationService.retryRecord(recordId);
  }

  @Post('rtdn/retry-failed')
  async retryFailedRtdn(
    @Body()
    dto: RetryGooglePlayFailuresDto,
  ) {
    return this.rtdnProcessorService.retryFailedEvents({
      includeDeadLetter: dto.includeDeadLetter,

      limit: dto.limit,
    });
  }

  @Post('rtdn/:eventId/retry')
  async retryRtdnEvent(
    @Param(
      'eventId',
      new ParseUUIDPipe({
        version: '4',
      }),
    )
    eventId: string,
  ) {
    return this.rtdnProcessorService.retryEvent(eventId);
  }
}
