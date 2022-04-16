import { go, GoAsyncOptions } from '@api3/promise-utils';
import { ethers } from 'ethers';
import { shortenAddress } from './utils';

export const getTransactionCount = async (
  rpcProvider: ethers.providers.StaticJsonRpcProvider,
  sponsorWalletAddress: string,
  currentBlockNumber: number,
  goOptions: GoAsyncOptions
): Promise<number | null> => {
  const goTransactionCount = await go(
    () => rpcProvider.getTransactionCount(sponsorWalletAddress, currentBlockNumber),
    goOptions
  );

  if (!goTransactionCount.success) {
    console.log(`Unable to fetch transaction count. Error: ${goTransactionCount.error}`);
    return null;
  }

  const transactionCount = goTransactionCount.data;
  console.log(`Transaction count for sponsor wallet ${shortenAddress(sponsorWalletAddress)} is ${transactionCount}`);

  return transactionCount;
};
