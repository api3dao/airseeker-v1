import { ethers } from 'ethers';

export const checkUpdateCondition = async (
  _voidSigner: ethers.VoidSigner,
  _dapiServer: ethers.Contract,
  _beaconId: string,
  _deviationThreshold: number,
  _apiValue: ethers.BigNumber
) => {
  return true;
};
