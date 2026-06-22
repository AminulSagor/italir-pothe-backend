import { BadRequestException } from '@nestjs/common';

const MONEY_SCALE = 2;
const FOREX_SCALE = 6;
const FOREX_FACTOR = 1_000_000n;

function parseScaledDecimal(
  value: string | number,
  scale: number,
  fieldName: string,
): bigint {
  const normalized = String(value).trim();

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new BadRequestException(
      `${fieldName} must be a valid decimal number.`,
    );
  }

  const [wholePart, fractionPart = ''] = normalized.split('.');

  if (fractionPart.length > scale) {
    throw new BadRequestException(
      `${fieldName} supports a maximum of ${scale} decimal places.`,
    );
  }

  const factor = 10n ** BigInt(scale);
  const fraction = fractionPart.padEnd(scale, '0');

  return BigInt(wholePart) * factor + BigInt(fraction || '0');
}

function formatScaledDecimal(value: bigint, scale: number): string {
  const factor = 10n ** BigInt(scale);
  const whole = value / factor;
  const fraction = (value % factor).toString().padStart(scale, '0');

  return `${whole.toString()}.${fraction}`;
}

function divideAndRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  return (numerator + denominator / 2n) / denominator;
}

export function normalizeMoney(value: string | number): string {
  return formatScaledDecimal(
    parseScaledDecimal(value, MONEY_SCALE, 'Amount'),
    MONEY_SCALE,
  );
}

export function normalizeForexRate(value: string | number): string {
  const scaled = parseScaledDecimal(value, FOREX_SCALE, 'Forex rate');

  if (scaled <= 0n) {
    throw new BadRequestException('Forex rate must be greater than zero.');
  }

  return formatScaledDecimal(scaled, FOREX_SCALE);
}

export function calculatePercentageDiscount(params: {
  baseAmount: string;
  percentage: number;
}) {
  const baseMinor = parseScaledDecimal(
    params.baseAmount,
    MONEY_SCALE,
    'Course price',
  );

  if (
    !Number.isInteger(params.percentage) ||
    params.percentage < 0 ||
    params.percentage > 99
  ) {
    throw new BadRequestException(
      'Discount percentage must be between 0 and 99.',
    );
  }

  const discountMinor = divideAndRoundHalfUp(
    baseMinor * BigInt(params.percentage),
    100n,
  );

  const payableMinor = baseMinor - discountMinor;

  return {
    baseAmount: formatScaledDecimal(baseMinor, MONEY_SCALE),
    discountAmount: formatScaledDecimal(discountMinor, MONEY_SCALE),
    payableAmount: formatScaledDecimal(payableMinor, MONEY_SCALE),
  };
}

export function convertEurToBdt(params: {
  amountEur: string;
  forexRate: string;
}): string {
  const eurMinor = parseScaledDecimal(
    params.amountEur,
    MONEY_SCALE,
    'EUR amount',
  );

  const rateScaled = parseScaledDecimal(
    params.forexRate,
    FOREX_SCALE,
    'Forex rate',
  );

  const bdtMinor = divideAndRoundHalfUp(eurMinor * rateScaled, FOREX_FACTOR);

  return formatScaledDecimal(bdtMinor, MONEY_SCALE);
}

export function subtractMoney(minuend: string, subtrahend: string): string {
  const left = parseScaledDecimal(minuend, MONEY_SCALE, 'Amount');

  const right = parseScaledDecimal(subtrahend, MONEY_SCALE, 'Amount');

  if (right > left) {
    throw new BadRequestException(
      'The subtracted amount cannot exceed the original amount.',
    );
  }

  return formatScaledDecimal(left - right, MONEY_SCALE);
}

export function isPositiveMoney(value: string | number): boolean {
  try {
    return parseScaledDecimal(value, MONEY_SCALE, 'Amount') > 0n;
  } catch {
    return false;
  }
}

export function zeroMoney(): string {
  return formatScaledDecimal(0n, MONEY_SCALE);
}
