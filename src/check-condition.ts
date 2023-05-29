import { ethers } from 'ethers';
import { calculateUpdateInPercentage } from './calculations';
import { HUNDRED_PERCENT } from './constants';
import { LogsData, logger } from './logging';
import { BeaconSetTrigger, BeaconTrigger } from './validation';

export const checkConditions = (
  onChainDataValue: ethers.BigNumber,
  onChainDataTimestamp: number,
  fulfillmentDataTimestamp: number,
  trigger: Pick<BeaconTrigger | BeaconSetTrigger, 'deviationThreshold' | 'heartbeatInterval'>,
  apiValue: ethers.BigNumber
): LogsData<boolean> => {
  // Check that fulfillment data is newer than on chain data
  const isFulfillmentDataFresh = checkFulfillmentDataTimestamp(onChainDataTimestamp, fulfillmentDataTimestamp);
  if (!isFulfillmentDataFresh) {
    const log = logger.pend('WARN', 'Fulfillment data older than on-chain data. Skipping.');
    return [[log], false];
  }

  // Check that on chain data is newer than heartbeat interval
  const isOnchainDataFresh = checkOnchainDataFreshness(onChainDataTimestamp, trigger.heartbeatInterval);
  if (!isOnchainDataFresh) {
    const log = logger.pend('INFO', 'On chain data timestamp older than heartbeat. Updating without condition check.');
    return [[log], true];
  } else {
    // Check beacon condition
    const shouldUpdate = checkUpdateCondition(onChainDataValue, trigger.deviationThreshold, apiValue);
    if (!shouldUpdate) {
      const log = logger.pend('WARN', 'Deviation threshold not reached. Skipping.');
      return [[log], false];
    }
  }
  const log = logger.pend('INFO', 'Deviation threshold reached. Updating.');
  return [[log], true];
};

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
