import { ethers } from 'ethers';
import { initializeState } from './state';
import { getTransactionCount } from './transaction-count';

describe('getTransactionCount', () => {
  let rpcProvider: ethers.providers.StaticJsonRpcProvider;
  const sponsorWalletAddress = '0x20557D8e841d7c2B12DBD45022B9147286F57691';
  const blockNumber = 5;
  const goOptions = {};

  beforeEach(() => {
    initializeState(null as any); // We don't need airseeker.json file
  });

  it('returns a transaction count', async () => {
    rpcProvider = {
      getTransactionCount: jest.fn().mockResolvedValue(10),
    } as unknown as ethers.providers.StaticJsonRpcProvider;

    const transactionCount = await getTransactionCount(rpcProvider, sponsorWalletAddress, blockNumber, goOptions);
    expect(transactionCount).toEqual(10);
    expect(rpcProvider.getTransactionCount).toHaveBeenCalledWith(sponsorWalletAddress, blockNumber);
  });

  it('returns null if transaction count cannot be retrieved', async () => {
    rpcProvider = {
      getTransactionCount: jest.fn().mockImplementation(() => {
        throw new Error('Mock error');
      }),
    } as unknown as ethers.providers.StaticJsonRpcProvider;

    const transactionCount = await getTransactionCount(rpcProvider, sponsorWalletAddress, blockNumber, goOptions);
    expect(transactionCount).toBeNull();
  });
});
