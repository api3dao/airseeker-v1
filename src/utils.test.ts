import { PriorityFee } from '@api3/airnode-utilities';
import { BigNumber } from 'ethers';
import { parsePriorityFee, calculateTimeout, prepareGoOptions } from './utils';

describe('parsePriorityFee', () => {
  [
    [{ value: 123, unit: 'wei' }, BigNumber.from('123')],
    [{ value: 123 }, BigNumber.from('123')],
    [{ value: 123.4, unit: 'kwei' }, BigNumber.from('123400')],
    [{ value: 123.4, unit: 'mwei' }, BigNumber.from('123400000')],
    [{ value: 123.4, unit: 'gwei' }, BigNumber.from('123400000000')],
    [{ value: 123.4, unit: 'szabo' }, BigNumber.from('123400000000000')],
    [{ value: 123.4, unit: 'finney' }, BigNumber.from('123400000000000000')],
    [{ value: 123.4, unit: 'ether' }, BigNumber.from('123400000000000000000')],
  ].forEach(([input, result], index) => {
    it(`returns parsed wei from numbers - ${index}`, () => {
      const priorityFeeInWei = parsePriorityFee(input as PriorityFee);
      expect(priorityFeeInWei).toEqual(result);
    });
  });

  [
    { value: 3.12, unit: 'pence' },
    { value: '3.1p', unit: 'gwei' },
    { value: 3.12, unit: 'wei' },
  ].forEach((input, index) => {
    it(`throws an error for an invalid decimal denominated string, number and unit - ${index}`, () => {
      const throwingFunction = () => parsePriorityFee(input as PriorityFee);
      expect(throwingFunction).toThrow();
    });
  });
});

describe('calculateTimeout', () => {
  it('calculates the remaining time for timeout', () => {
    const startTime = 1650548022000;
    const totalTimeout = 3000;
    jest.spyOn(Date, 'now').mockReturnValue(1650548023000);

    expect(calculateTimeout(startTime, totalTimeout)).toEqual(2000);
  });
});

describe('prepareGoOptions', () => {
  it('prepares options for the go function', () => {
    const startTime = 1650548022000;
    const totalTimeout = 3000;
    jest.spyOn(Date, 'now').mockReturnValue(1650548023000);

    const expectedGoOptions = {
      attemptTimeoutMs: 5_000,
      totalTimeoutMs: 2000,
      retries: 100_000,
      delay: { type: 'random' as const, minDelayMs: 0, maxDelayMs: 2_500 },
    };
    expect(prepareGoOptions(startTime, totalTimeout)).toEqual(expectedGoOptions);
  });
});
