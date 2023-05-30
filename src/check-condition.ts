import { ethers } from 'ethers';
import { PendingLog } from '@api3/airnode-utilities';
import { calculateUpdateInPercentage } from './calculations';
import { HUNDRED_PERCENT } from './constants';
import { logger } from './logging';
import { BeaconSetTrigger, BeaconTrigger } from './validation';
export enum UpdateStatus {
  NONE,
  FULFILLMENT_DATA_OLDER_THAN_ON_CHAIN_MESSAGE = 'Fulfillment data older than on-chain data. Skipping.',
  ON_CHAIN_TIMESTAMP_OLDER_THAN_HEARTBEAT_MESSAGE = 'On chain data timestamp older than heartbeat',
  DEVIATION_THRESHOLD_REACHED_MESSAGE = 'Deviation threshold exceeded',
}

export const checkConditions = (
  onChainDataValue: ethers.BigNumber,
  onChainDataTimestamp: number,
  fulfillmentDataTimestamp: number,
  trigger: Pick<BeaconTrigger | BeaconSetTrigger, 'deviationThreshold' | 'heartbeatInterval'>,
  apiValue: ethers.BigNumber
): [PendingLog[], boolean, UpdateStatus] => {
  // Check that fulfillment data is newer than on chain data
  const isFulfillmentDataFresh = checkFulfillmentDataTimestamp(onChainDataTimestamp, fulfillmentDataTimestamp);
  if (!isFulfillmentDataFresh) {
    const log = logger.pend('WARN', UpdateStatus.FULFILLMENT_DATA_OLDER_THAN_ON_CHAIN_MESSAGE);
    return [[log], false, UpdateStatus.FULFILLMENT_DATA_OLDER_THAN_ON_CHAIN_MESSAGE];
  }

  // Check that on chain data is newer than heartbeat interval
  const isOnchainDataFresh = checkOnchainDataFreshness(onChainDataTimestamp, trigger.heartbeatInterval);
  if (!isOnchainDataFresh) {
    const log = logger.pend('INFO', UpdateStatus.ON_CHAIN_TIMESTAMP_OLDER_THAN_HEARTBEAT_MESSAGE);
    return [[log], true, UpdateStatus.ON_CHAIN_TIMESTAMP_OLDER_THAN_HEARTBEAT_MESSAGE];
  } else {
    // Check beacon condition
    const shouldUpdate = checkUpdateCondition(onChainDataValue, trigger.deviationThreshold, apiValue);
    if (!shouldUpdate) {
      const log = logger.pend('WARN', UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE);
      return [[log], false, UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE];
    }
  }
  const log = logger.pend('INFO', 'Deviation threshold reached. Updating.');
  return [[log], true, UpdateStatus.NONE];
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
