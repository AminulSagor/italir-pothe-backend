import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/users/entities/user.entity';
import {
  AddManualLedgerEntryDto,
  CreateInfluencerPartnerDto,
  InfluencerPartnerQueryDto,
  InfluencerReportQueryDto,
  UpdateInfluencerPartnerDto,
} from '../dto/influencer-hub.dto';
import { InfluencerLedgerTransactionType } from '../types/influencer-hub.type';
import { InfluencerHubService } from '../services/influencer-hub.service';

@Controller('api/admin/influencers')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminInfluencersController {
  constructor(private readonly influencerHubService: InfluencerHubService) {}

  @Get('dashboard')
  getDashboard() {
    return this.influencerHubService.getDashboard();
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="influencer-partners.csv"')
  exportCsv(@Query() query: InfluencerPartnerQueryDto) {
    return this.influencerHubService.exportCsv(query);
  }

  @Get()
  listPartners(@Query() query: InfluencerPartnerQueryDto) {
    return this.influencerHubService.listPartners(query);
  }

  @Post()
  @HttpCode(201)
  createPartner(@Body() dto: CreateInfluencerPartnerDto) {
    return this.influencerHubService.createPartner(dto);
  }

  @Get(':partnerId/report')
  getReport(
    @Param('partnerId', new ParseUUIDPipe({ version: '4' })) partnerId: string,
    @Query() query: InfluencerReportQueryDto,
  ) {
    return this.influencerHubService.getReport(partnerId, query);
  }

  @Get(':partnerId')
  getPartner(
    @Param('partnerId', new ParseUUIDPipe({ version: '4' })) partnerId: string,
  ) {
    return this.influencerHubService.getPartner(partnerId);
  }

  @Patch(':partnerId')
  updatePartner(
    @Param('partnerId', new ParseUUIDPipe({ version: '4' })) partnerId: string,
    @Body() dto: UpdateInfluencerPartnerDto,
  ) {
    return this.influencerHubService.updatePartner(partnerId, dto);
  }

  @Delete(':partnerId')
  archivePartner(
    @Param('partnerId', new ParseUUIDPipe({ version: '4' })) partnerId: string,
  ) {
    return this.influencerHubService.archivePartner(partnerId);
  }

  @Post(':partnerId/payouts')
  @HttpCode(201)
  createPayout(
    @Param('partnerId', new ParseUUIDPipe({ version: '4' })) partnerId: string,
    @Body() dto: AddManualLedgerEntryDto,
  ) {
    return this.influencerHubService.createLedgerEntry(partnerId, {
      ...dto,
      transactionType: dto.transactionType ?? InfluencerLedgerTransactionType.PAYOUT,
    });
  }

  @Post(':partnerId/ledger/adjustments')
  @HttpCode(201)
  createLedgerAdjustment(
    @Param('partnerId', new ParseUUIDPipe({ version: '4' })) partnerId: string,
    @Body() dto: AddManualLedgerEntryDto,
  ) {
    return this.influencerHubService.createLedgerEntry(partnerId, {
      ...dto,
      transactionType:
        dto.transactionType ?? InfluencerLedgerTransactionType.MANUAL_ADJUSTMENT,
    });
  }
}
