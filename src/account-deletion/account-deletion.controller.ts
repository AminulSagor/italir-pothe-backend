import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';

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
  requestOtp(@Body() dto: RequestAccountDeletionOtpDto) {
    return this.accountDeletionService.requestDeletionOtp(dto);
  }

  @Post('confirm')
  @HttpCode(HttpStatus.OK)
  confirmDeletion(@Body() dto: ConfirmAccountDeletionDto) {
    return this.accountDeletionService.confirmDeletion(dto);
  }
}
