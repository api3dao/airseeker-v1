import { BigNumber, ethers } from 'ethers';
import { calculateBeaconSetTimestamp, calculateMedian, calculateUpdateInPercentage } from './calculations';
import { HUNDRED_PERCENT } from './constants';
import { State, updateState } from './state';

describe('calculateUpdateInPercentage', () => {
  beforeEach(() => {
    updateState(() => ({ logOptions: {} } as unknown as State));
  });

  it('calculates zero change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(10), ethers.BigNumber.from(10));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(0 * HUNDRED_PERCENT));
  });

  it('calculates 100 percent change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(10), ethers.BigNumber.from(20));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(1 * HUNDRED_PERCENT));
  });

  it('calculates positive to negative change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(10), ethers.BigNumber.from(-5));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(1.5 * HUNDRED_PERCENT));
  });

  it('calculates negative to positive change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(-5), ethers.BigNumber.from(5));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(2 * HUNDRED_PERCENT));
  });

  it('calculates initial zero to positive change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(0), ethers.BigNumber.from(5));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(5 * HUNDRED_PERCENT));
  });

  it('calculates initial zero to negative change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(0), ethers.BigNumber.from(-5));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(5 * HUNDRED_PERCENT));
  });

  it('calculates initial positive to zero change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(5), ethers.BigNumber.from(0));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(1 * HUNDRED_PERCENT));
  });

  it('calculates initial negative to zero change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(-5), ethers.BigNumber.from(0));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(1 * HUNDRED_PERCENT));
  });

  it('calculates initial negative to negative change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(-5), ethers.BigNumber.from(-1));
    expect(updateInPercentage).toEqual(ethers.BigNumber.from(0.8 * HUNDRED_PERCENT));
  });
});

describe('caluclateMedian', () => {
  describe('for array with odd number of elements', () => {
    it('calculates median for sorted array', () => {
      const arr = [BigNumber.from(10), BigNumber.from(11), BigNumber.from(24), BigNumber.from(30), BigNumber.from(47)];
      expect(calculateMedian(arr)).toEqual(BigNumber.from(24));
    });

    it('calculates median for unsorted array', () => {
      const arr = [BigNumber.from(24), BigNumber.from(11), BigNumber.from(10), BigNumber.from(47), BigNumber.from(30)];
      expect(calculateMedian(arr)).toEqual(BigNumber.from(24));
    });
  });

  describe('for array with even number of elements', () => {
    it('calculates median for sorted array', () => {
      const arr = [BigNumber.from(10), BigNumber.from(11), BigNumber.from(24), BigNumber.from(30)];
      expect(calculateMedian(arr)).toEqual(BigNumber.from(17));
    });

    it('calculates median for unsorted array', () => {
      const arr = [BigNumber.from(24), BigNumber.from(11), BigNumber.from(10), BigNumber.from(30)];
      expect(calculateMedian(arr)).toEqual(BigNumber.from(17));
    });
  });
});

describe('calculateBeaconSetTimestamp', () => {
  it('calculates beacon set timestamp', () => {
    const beaconSetBeaconTimestamps = ['1555711223', '1556229645', '1555020018', '1556402497'];
    expect(calculateBeaconSetTimestamp(beaconSetBeaconTimestamps)).toEqual(1555840845);
  });
});
