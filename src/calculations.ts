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
