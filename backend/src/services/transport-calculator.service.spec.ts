import { describe, expect, it } from 'vitest';
import { TransportCalculatorService, TransportType } from './transport-calculator.service';

describe('TransportCalculatorService', () => {
  const calculator = new TransportCalculatorService();

  it.each([
    ['PIEDECUESA', 8_000],
    ['GIRON', 5_000],
    ['LEBRIJA', 10_000],
    ['FLORIDA', 3_000],
    ['BARRANCABERMEJA', 85_000],
    ['SAN_GIL', 95_000],
  ])('calculates the Bucaramanga moto transfer to %s at %i COP', (destination, expected) => {
    expect(
      calculator.calculateTransferValue(TransportType.MOTO, destination, [], 0),
    ).toBe(expected);
    expect(calculator.getMotoTariff(destination)).toBe(expected);
  });
});
