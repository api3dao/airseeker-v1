import { GoAsyncOptions } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { RANDOM_BACKOFF_MAX_MS, RANDOM_BACKOFF_MIN_MS } from './constants';

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const shortenAddress = (address: string) => address.replace(address.substring(5, 38), '...');

export const calculateTimeout = (startTime: number, totalTimeout: number) => totalTimeout - (Date.now() - startTime);

export const prepareGoOptions = (_startTime: number, _totalTimeout: number): GoAsyncOptions => ({
  delay: { type: 'random' as const, minDelayMs: RANDOM_BACKOFF_MIN_MS, maxDelayMs: RANDOM_BACKOFF_MAX_MS },
});

export const createDummyBeaconUpdateData = async (dummyAirnode: ethers.Wallet = ethers.Wallet.createRandom()) => {
  const dummyBeaconTemplateId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const dummyBeaconTimestamp = Math.floor(Date.now() / 1000);
  const randomBytes = ethers.utils.randomBytes(Math.floor(Math.random() * 27) + 1);
  const dummyBeaconData = ethers.utils.defaultAbiCoder.encode(
    ['int224'],
    // Any radom number that fits into an int224
    [ethers.BigNumber.from(randomBytes)]
  );
  const dummyBeaconSignature = await dummyAirnode.signMessage(
    ethers.utils.arrayify(
      ethers.utils.solidityKeccak256(
        ['bytes32', 'uint256', 'bytes'],
        [dummyBeaconTemplateId, dummyBeaconTimestamp, dummyBeaconData]
      )
    )
  );
  return { dummyAirnode, dummyBeaconTemplateId, dummyBeaconTimestamp, dummyBeaconData, dummyBeaconSignature };
};
