import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ForexRateProvider } from './forex-rate-provider';
import { normalizeForexRate } from 'src/common/utils/commerce-money.util';

@Injectable()
export class DemoForexRateService implements ForexRateProvider {
  constructor(private readonly configService: ConfigService) {}

  async getEurToBdtRate(): Promise<string> {
    const configuredRate =
      this.configService.get<string>('DEMO_EUR_TO_BDT_RATE') ?? '143.88';

    return normalizeForexRate(configuredRate);
  }
}
