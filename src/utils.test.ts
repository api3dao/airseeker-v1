import { PriorityFee } from '@api3/airnode-utilities';
import { BigNumber } from 'ethers';
import { parsePriorityFee } from './utils';

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
