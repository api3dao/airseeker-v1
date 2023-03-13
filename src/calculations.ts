import { ethers } from 'ethers';
import { HUNDRED_PERCENT } from './constants';

export const calculateUpdateInPercentage = (initialValue: ethers.BigNumber, updatedValue: ethers.BigNumber) => {
  const delta = updatedValue.sub(initialValue);
  const absoluteDelta = delta.abs();

  // Avoid division by 0
  const absoluteInitialValue = initialValue.isZero() ? ethers.BigNumber.from(1) : initialValue.abs();

  return absoluteDelta.mul(ethers.BigNumber.from(HUNDRED_PERCENT)).div(absoluteInitialValue);
};

export const calculateMedian = (arr: ethers.BigNumber[]) => {
  const mid = Math.floor(arr.length / 2);
  const nums = [...arr].sort((a, b) => {
    if (a.lt(b)) return -1;
    else if (a.gt(b)) return 1;
    else return 0;
  });
  return arr.length % 2 !== 0 ? nums[mid] : nums[mid - 1].add(nums[mid]).div(2);
};

// TODO: check Api3ServerV1 to determine if this is still correct
// Calculate beacon set timestamp from beacon timestamps (https://github.com/api3dao/airnode-protocol-v1/blob/main/contracts/dapis/DapiServer.sol#L443)
export const calculateBeaconSetTimestamp = (beaconSetBeaconTimestamps: string[]) => {
  const accumulatedTimestamp = beaconSetBeaconTimestamps.reduce((total, next) => total + parseInt(next, 10), 0);
  return Math.floor(accumulatedTimestamp / beaconSetBeaconTimestamps.length);
};
