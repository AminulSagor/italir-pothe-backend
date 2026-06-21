export const FOREX_RATE_PROVIDER = Symbol('FOREX_RATE_PROVIDER');

export interface ForexRateProvider {
  getEurToBdtRate(): Promise<string>;
}
