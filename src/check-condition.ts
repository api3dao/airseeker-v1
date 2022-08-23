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
 * Returns true when the signed data response is fresh enough to be used for an on chain update.
 *
 * Update transaction with stale data would revert on chain, draining the sponsor wallet. See:
 * https://github.com/api3dao/airnode-protocol-v1/blob/e0d778fabff0df888987a6db31498c93ee2f6219/contracts/dapis/DapiServer.sol#L867
 * This can happen if the gateway or Airseeker is down and Airkeeper does the updates instead.
 */
export const checkSignedDataFreshness = (onChainTimestamp: number, signedDataTimestamp: string) => {
  return onChainTimestamp < parseInt(signedDataTimestamp, 10);
};

/**
 * Returns true when the on chain data timestamp is newer than the heartbeat interval.
 */
export const checkOnchainDataFreshness = (timestamp: number, heartbeatInterval: number) => {
  return timestamp > Date.now() / 1000 - heartbeatInterval;
};
