import { BigNumber, ethers } from 'ethers';
import {
  calculateUpdateInPercentage,
  checkSignedDataFreshness,
  checkOnchainDataFreshness,
  checkUpdateCondition,
  HUNDRED_PERCENT,
  OnChainBeaconData,
} from './check-condition';
import { DEFAULT_LOG_OPTIONS } from './constants';
import { State, updateState } from './state';
import { getUnixTimestamp, validSignedData } from '../test/fixtures';

updateState((_state) => ({ logOptions: DEFAULT_LOG_OPTIONS } as unknown as State));

describe('calculateUpdateInPercentage', () => {
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

describe('checkUpdateCondition', () => {
  const onChainData: OnChainBeaconData = {
    value: ethers.BigNumber.from(500),
    timestamp: getUnixTimestamp('2019-3-21'),
  };

  it('reads dapiserver value and checks the threshold condition to be true for increase', async () => {
    const shouldUpdate = await checkUpdateCondition(onChainData, 10, ethers.BigNumber.from(560));

    expect(shouldUpdate).toEqual(true);
  });

  it('reads dapiserver value and checks the threshold condition to be true for decrease', async () => {
    const shouldUpdate = await checkUpdateCondition(onChainData, 10, ethers.BigNumber.from(440));

    expect(shouldUpdate).toEqual(true);
  });

  it('reads dapiserver value and checks the threshold condition to be false', async () => {
    const shouldUpdate = await checkUpdateCondition(onChainData, 10, ethers.BigNumber.from(480));

    expect(shouldUpdate).toEqual(false);
  });

  it('handles correctly bad JS math', async () => {
    await expect(checkUpdateCondition(onChainData, 0.14, ethers.BigNumber.from(560))).resolves.not.toThrow();
  });
});

describe('checkSignedDataFreshness', () => {
  it('returns true if signed data gateway is newer than on chain record', () => {
    const isFresh = checkSignedDataFreshness(
      { value: BigNumber.from('123'), timestamp: getUnixTimestamp('2022-4-28') },
      validSignedData
    );

    expect(isFresh).toBe(false);
  });

  it('returns false if signed data gateway is older than on chain record', () => {
    const isFresh = checkSignedDataFreshness(
      { value: BigNumber.from('123'), timestamp: getUnixTimestamp('2019-4-28') },
      validSignedData
    );

    expect(isFresh).toBe(true);
  });

  describe('checkOnchainDataFreshness', () => {
    it('returns true if on chain data timestamp is newer than heartbeat interval', () => {
      const isFresh = checkOnchainDataFreshness(Date.now() / 1000 - 100, 200);

      expect(isFresh).toEqual(true);
    });
    it('returns false if on chain data timestamp is older than heartbeat interval', () => {
      const isFresh = checkOnchainDataFreshness(Date.now() / 1000 - 300, 200);

      expect(isFresh).toEqual(false);
    });
  });
});
