import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';

import { AccountDeletionService } from './account-deletion.service';
import { ConfirmAccountDeletionDto } from './dto/confirm-account-deletion.dto';
import { RequestAccountDeletionOtpDto } from './dto/request-account-deletion-otp.dto';

@Controller('public/account-deletion')
export class AccountDeletionController {
  constructor(
    private readonly accountDeletionService: AccountDeletionService,
  ) {}

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  requestOtp(@Body() dto: RequestAccountDeletionOtpDto, @Req() req: Request) {
    return this.accountDeletionService.requestDeletionOtp(dto, req.ip);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirmDeletion(
    @Body() dto: ConfirmAccountDeletionDto,
    @Req() req: Request,
  ) {
    return this.accountDeletionService.confirmDeletion(dto, req.ip);
  }
}
