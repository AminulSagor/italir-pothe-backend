import type { ValueTransformer } from 'typeorm';

export const bigintNumberTransformer: ValueTransformer = {
  to(value: number | null | undefined): number | null | undefined {
    return value;
  },

  from(value: string | number | null): number | null {
    if (value === null) {
      return null;
    }

    const parsedValue = Number(value);

    if (!Number.isSafeInteger(parsedValue)) {
      throw new Error(`Unsafe bigint value received: ${value}`);
    }

    return parsedValue;
  },
};
