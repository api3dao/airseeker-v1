import { ethers } from 'ethers';
import { checkFulfillmentDataTimestamp, checkOnchainDataFreshness, checkUpdateCondition } from './check-condition';
import { getUnixTimestamp } from '../test/fixtures';

describe('checkUpdateCondition', () => {
  const onChainValue = ethers.BigNumber.from(500);

  it('returns true when api value is higher and deviation threshold is reached', () => {
    const shouldUpdate = checkUpdateCondition(onChainValue, 10, ethers.BigNumber.from(560));

    expect(shouldUpdate).toEqual(true);
  });

  it('returns true when api value is lower and deviation threshold is reached', () => {
    const shouldUpdate = checkUpdateCondition(onChainValue, 10, ethers.BigNumber.from(440));

    expect(shouldUpdate).toEqual(true);
  });

  it('returns false when deviation threshold is not reached', () => {
    const shouldUpdate = checkUpdateCondition(onChainValue, 10, ethers.BigNumber.from(480));

    expect(shouldUpdate).toEqual(false);
  });

  it('handles correctly bad JS math', () => {
    expect(() => checkUpdateCondition(onChainValue, 0.14, ethers.BigNumber.from(560))).not.toThrow();
  });
});

describe('checkFulfillmentDataTimestamp', () => {
  const onChainData = {
    value: ethers.BigNumber.from(10),
    timestamp: getUnixTimestamp('2019-4-28'),
  };

  it('returns true if fulfillment data is newer than on-chain record', () => {
    const isFresh = checkFulfillmentDataTimestamp(onChainData.timestamp, getUnixTimestamp('2019-4-29'));
    expect(isFresh).toBe(true);
  });

  it('returns false if fulfillment data is older than on-chain record', () => {
    const isFresh = checkFulfillmentDataTimestamp(onChainData.timestamp, getUnixTimestamp('2019-4-27'));
    expect(isFresh).toBe(false);
  });

  it('returns false if fulfillment data has same timestamp with on-chain record', () => {
    const isFresh = checkFulfillmentDataTimestamp(onChainData.timestamp, onChainData.timestamp);
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
