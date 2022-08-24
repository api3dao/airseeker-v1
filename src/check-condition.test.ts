import { ethers } from 'ethers';
import {
  checkBeaconSetSignedDataFreshness,
  checkBeaconSignedDataFreshness,
  checkOnchainDataFreshness,
  checkUpdateCondition,
} from './check-condition';
import { getUnixTimestamp, validSignedData } from '../test/fixtures';

describe('checkUpdateCondition', () => {
  const onChainValue = ethers.BigNumber.from(500);

  it('reads dapiserver value and checks the threshold condition to be true for increase', () => {
    const shouldUpdate = checkUpdateCondition(onChainValue, 10, ethers.BigNumber.from(560));

    expect(shouldUpdate).toEqual(true);
  });

  it('reads dapiserver value and checks the threshold condition to be true for decrease', () => {
    const shouldUpdate = checkUpdateCondition(onChainValue, 10, ethers.BigNumber.from(440));

    expect(shouldUpdate).toEqual(true);
  });

  it('reads dapiserver value and checks the threshold condition to be false', () => {
    const shouldUpdate = checkUpdateCondition(onChainValue, 10, ethers.BigNumber.from(480));

    expect(shouldUpdate).toEqual(false);
  });

  it('handles correctly bad JS math', () => {
    expect(() => checkUpdateCondition(onChainValue, 0.14, ethers.BigNumber.from(560))).not.toThrow();
  });
});

describe('checkBeaconSignedDataFreshness', () => {
  it('returns true if signed data is newer than on chain record', () => {
    const isFresh = checkBeaconSignedDataFreshness(getUnixTimestamp('2019-4-28'), validSignedData.timestamp);

    expect(isFresh).toBe(true);
  });

  it('returns false if signed data is older than on chain record', () => {
    const isFresh = checkBeaconSignedDataFreshness(getUnixTimestamp('2022-4-28'), validSignedData.timestamp);

    expect(isFresh).toBe(false);
  });
});

describe('checkBeaconSetSignedDataFreshness', () => {
  it('returns true if signed data is newer than on chain record', () => {
    const beaconSetBeaconTimestamps = ['1555711223', '1556229645', '1555020018', '1556402497'];
    const isFresh = checkBeaconSetSignedDataFreshness(getUnixTimestamp('2019-4-20'), beaconSetBeaconTimestamps);

    expect(isFresh).toBe(true);
  });

  it('returns false if signed data is older than on chain record', () => {
    const beaconSetBeaconTimestamps = ['1555711223', '1556229645', '1555020018', '1556402497'];
    const isFresh = checkBeaconSetSignedDataFreshness(getUnixTimestamp('2019-4-28'), beaconSetBeaconTimestamps);

    expect(isFresh).toBe(false);
  });
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
