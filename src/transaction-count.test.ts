import { ethers } from 'ethers';
import { initializeState } from './state';
import { getTransactionCount } from './transaction-count';

describe('getTransactionCount', () => {
  const chainId = '31337';
  const sponsorWalletAddress = '0x20557D8e841d7c2B12DBD45022B9147286F57691';
  const goOptions = {};

  beforeEach(() => {
    initializeState({ log: { format: 'plain', level: 'INFO' } } as any); // We don't need airseeker.json file
  });

  it('returns a transaction count', async () => {
    const provider = {
      rpcProvider: {
        getTransactionCount: jest.fn().mockResolvedValue(10),
      } as unknown as ethers.providers.StaticJsonRpcProvider,
      chainId,
      providerName: 'mock-provider',
    };

    const transactionCount = await getTransactionCount(provider, sponsorWalletAddress, goOptions);
    expect(transactionCount).toEqual(10);
    expect(provider.rpcProvider.getTransactionCount).toHaveBeenCalledWith(sponsorWalletAddress);
  });

  it('returns null if transaction count cannot be retrieved', async () => {
    const provider = {
      rpcProvider: {
        getTransactionCount: jest.fn().mockImplementation(() => {
          throw new Error('Mock error');
        }),
      } as unknown as ethers.providers.StaticJsonRpcProvider,
      chainId,
      providerName: 'mock-provider',
    };

    const transactionCount = await getTransactionCount(provider, sponsorWalletAddress, goOptions);
    expect(transactionCount).toBeNull();
  });
});
