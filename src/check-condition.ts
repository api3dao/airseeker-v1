import { ethers } from 'ethers';
import { calculateUpdateInPercentage } from './calculations';
import { HUNDRED_PERCENT } from './constants';

export const checkUpdateCondition = (
  onChainValue: ethers.BigNumber,
  deviationThreshold: number,
  apiValue: ethers.BigNumber
) => {
  const updateInPercentage = calculateUpdateInPercentage(onChainValue, apiValue);
  const threshold = ethers.BigNumber.from(Math.trunc(deviationThreshold * HUNDRED_PERCENT)).div(
    ethers.BigNumber.from(100)
  );

  return updateInPercentage.gt(threshold);
};

/**
 * Returns true when the fulfillment data timestamp is newer than the on chain data timestamp.
 *
 * Update transaction with stale data would revert on chain, draining the sponsor wallet. See:
 * https://github.com/api3dao/airnode-protocol-v1/blob/dev/contracts/dapis/DataFeedServer.sol#L121
 * This can happen if the gateway or Airseeker is down and Airkeeper does the updates instead.
 */
export const checkFulfillmentDataTimestamp = (onChainDataTimestamp: number, fulfillmentDataTimestamp: number) => {
  return onChainDataTimestamp < fulfillmentDataTimestamp;
};

/**
 * Returns true when the on chain data timestamp is newer than the heartbeat interval.
 */
export const checkOnchainDataFreshness = (timestamp: number, heartbeatInterval: number) => {
  return timestamp > Date.now() / 1000 - heartbeatInterval;
};
