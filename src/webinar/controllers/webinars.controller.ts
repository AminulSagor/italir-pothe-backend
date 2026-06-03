import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from 'src/common/guards/jwt-auth.guard';
import { PaginationQueryDto } from '../dto/webinar.dto';
import { WebinarsService } from '../services/webinars.service';

@Controller('webinars')
@UseGuards(JwtAuthGuard)
export class WebinarsController {
  constructor(private readonly webinarsService: WebinarsService) {}

  @Get('upcoming')
  async getUpcomingWebinarsList(@Query() query: PaginationQueryDto) {
    return this.webinarsService.getUpcomingWebinarsList(query);
  }

  @Get(':id/participants')
  async getParticipantsList(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.webinarsService.getParticipantsList(id, query);
  }
}
