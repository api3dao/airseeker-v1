import { ethers } from 'ethers';
import { getCurrentBlockNumber } from './block-number';
import { initializeState } from './state';

describe('getCurrentBlockNumber', () => {
  const chainId = '31337';
  const goOptions = {};

  beforeEach(() => {
    initializeState(null as any); // We don't need airseeker.json file
  });

  it('returns current block number', async () => {
    const mockGetBlockNumber = jest.fn().mockImplementation(() => 42);
    const provider = {
      rpcProvider: {
        getBlockNumber: mockGetBlockNumber,
      } as unknown as ethers.providers.StaticJsonRpcProvider,
      chainId,
    };

    const blockNumber = await getCurrentBlockNumber(provider, goOptions);
    expect(blockNumber).toEqual(42);
  });

  it('returns null if current block number cannot be retrieved', async () => {
    const mockGetBlockNumber = jest.fn().mockImplementation(() => {
      throw new Error('Mock error');
    });
    const provider = {
      rpcProvider: {
        getBlockNumber: mockGetBlockNumber,
      } as unknown as ethers.providers.StaticJsonRpcProvider,
      chainId,
    };

    const blockNumber = await getCurrentBlockNumber(provider, goOptions);
    expect(blockNumber).toBeNull();
  });
});
