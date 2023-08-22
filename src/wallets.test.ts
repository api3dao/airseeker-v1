import { ethers } from 'ethers';
import * as state from './state';
import * as wallets from './wallets';
import { Config } from './validation';
import { RateLimitedProvider } from './providers';
import { logger } from './logging';
import { shortenAddress } from './utils';

const config = {
  log: {
    format: 'plain',
    level: 'DEBUG',
  },
  airseekerWalletMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
  triggers: {
    dataFeedUpdates: {
      1: {
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
          beacons: [],
          beaconSets: [],
          updateInterval: 30,
        },
      },
      3: {
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
          beacons: [],
          beaconSets: [],
          updateInterval: 30,
        },
        '0x150700e52ba22fe103d60981c97bc223ac40dd4e': {
          beacons: [],
          beaconSets: [],
          updateInterval: 30,
        },
      },
    },
  },
} as unknown as Config;

beforeEach(() => {
  state.initializeState(config);
  wallets.initializeWallets();
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('initializeWallets', () => {
  // This test ensures the initialization of the wallets and their private keys.
  it('initialize wallets', () => {
    const { airseekerWalletPrivateKey, sponsorWalletsPrivateKey } = state.getState();

    expect(typeof airseekerWalletPrivateKey).toBe('string');
    expect(airseekerWalletPrivateKey).toBe('0xd627c727db73ed7067cbc1e15295f7004b83c01d243aa90711d549cda6bd5bca');

    // Because 2 unique sponsorAddresses are placed, following test is expected to be 2.
    expect(Object.keys(sponsorWalletsPrivateKey)).toHaveLength(2);
    expect(typeof sponsorWalletsPrivateKey['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC']).toBe('string');
    expect(typeof sponsorWalletsPrivateKey['0x150700e52ba22fe103d60981c97bc223ac40dd4e']).toBe('string');
    expect(sponsorWalletsPrivateKey['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC']).toBe(
      '0xcda66e77ae4eaab188a15717955f23cb7ee2a15f024eb272a7561cede1be427c'
    );
    expect(sponsorWalletsPrivateKey['0x150700e52ba22fe103d60981c97bc223ac40dd4e']).toBe(
      '0xf719b37066cff1e60726cfc8e656da47d509df3608d5ce38d94b6db93f03a54c'
    );
  });
});

describe('retrieveSponsorWalletAddress', () => {
  beforeEach(() => {
    jest.spyOn(state, 'getState');
  });

  // This test checks if the function retrieves the correct wallet address for a given sponsor address.
  it('should return the wallet address corresponding to the sponsor address', () => {
    const sponsorAddress = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';
    const expectedWalletAddress = '0x1129eEDf4996cF133e0e9555d4c9d305c9918EC5';

    const walletAddress = wallets.retrieveSponsorWalletAddress(sponsorAddress);

    expect(walletAddress).toBe(expectedWalletAddress);
    expect(state.getState).toHaveBeenCalledTimes(1);
  });

  // This test checks if the function throws an error when the sponsor address does not have an associated private key.
  it('should throw if private key of sponsor wallet not found for the sponsor', () => {
    const sponsorAddress = '0x0000000000000000000000000000000000000000';
    const expectedErrorMessage = `Pre-generated private key not found for sponsor ${sponsorAddress}`;
    expect(() => wallets.retrieveSponsorWalletAddress(sponsorAddress)).toThrow(expectedErrorMessage);
  });
});

describe('isBalanceZero', () => {
  // This test checks if the function correctly identifies a zero balance.
  it('should return true if the balance is zero', async () => {
    const rpcProvider = {
      getBalance: jest.fn().mockResolvedValueOnce(ethers.BigNumber.from('0x0')),
    } as unknown as RateLimitedProvider;

    const sponsorWalletAddress = 'sponsorWalletAddress';
    const expectedBalanceStatus = true;

    const balanceStatus = await wallets.isBalanceZero(rpcProvider, sponsorWalletAddress);

    expect(balanceStatus).toBe(expectedBalanceStatus);
    expect(rpcProvider.getBalance).toHaveBeenCalledTimes(1);
    expect(rpcProvider.getBalance).toHaveBeenCalledWith(sponsorWalletAddress);
  });

  // This test checks if the function correctly identifies a non-zero balance.
  it('should return false if the balance is non-zero', async () => {
    const rpcProvider = {
      getBalance: jest.fn().mockResolvedValueOnce(ethers.BigNumber.from('0x3')),
    } as unknown as RateLimitedProvider;

    const sponsorWalletAddress = 'sponsorWalletAddress';
    const expectedBalanceStatus = false;

    const balanceStatus = await wallets.isBalanceZero(rpcProvider, sponsorWalletAddress);

    expect(balanceStatus).toBe(expectedBalanceStatus);
    expect(rpcProvider.getBalance).toHaveBeenCalledTimes(1);
    expect(rpcProvider.getBalance).toHaveBeenCalledWith(sponsorWalletAddress);
  });

  // This test checks if the function properly throws an error when the balance retrieval fails.
  it('should throw an error if the balance retrieval fails', async () => {
    const rpcProvider = {
      getBalance: jest.fn().mockRejectedValue(new Error('RPC Error while retrieving balance')),
    } as unknown as RateLimitedProvider;

    const sponsorWalletAddress = 'sponsorWalletAddress';
    const expectedErrorMessage = 'RPC Error while retrieving balance';

    await expect(wallets.isBalanceZero(rpcProvider, sponsorWalletAddress)).rejects.toThrow(expectedErrorMessage);

    expect(rpcProvider.getBalance).toHaveBeenCalledTimes(2);
    expect(rpcProvider.getBalance).toHaveBeenCalledWith(sponsorWalletAddress);
  });
});

describe('getSponsorBalanceStatus', () => {
  // This test checks if the function can correctly retrieve the balance status when at least one provider is successful.
  it('should return the SponsorBalanceStatus if one of providers returns successfully', async () => {
    const chainSponsorGroup: wallets.ChainSponsorGroup = {
      chainId: 'chainId1',
      sponsorAddress: 'sponsorAddress1',
      providers: [
        {
          rpcProvider: {
            getBalance: jest.fn().mockResolvedValueOnce(ethers.BigNumber.from('0x0')),
          } as unknown as RateLimitedProvider,
          chainId: 'chainId1',
          providerName: 'provider1',
        },
        {
          rpcProvider: {
            getBalance: jest.fn().mockRejectedValue(new Error('RPC Error while retrieving balance')),
          } as unknown as RateLimitedProvider,
          chainId: 'chainId1',
          providerName: 'provider2',
        },
      ],
    };

    jest.spyOn(wallets, 'retrieveSponsorWalletAddress').mockImplementation(() => 'sponsorWalletAddress1');
    jest.spyOn(wallets, 'isBalanceZero');

    const expectedSponsorBalanceStatus = {
      sponsorAddress: 'sponsorAddress1',
      chainId: 'chainId1',
      isEmpty: true,
    };

    const sponsorBalanceStatus = await wallets.getSponsorBalanceStatus(chainSponsorGroup);

    expect(wallets.retrieveSponsorWalletAddress).toHaveBeenCalledTimes(1);
    expect(wallets.retrieveSponsorWalletAddress).toHaveBeenCalledWith('sponsorAddress1');
    expect(wallets.isBalanceZero).toHaveBeenCalledTimes(2);
    expect(wallets.isBalanceZero).toHaveBeenCalledWith(
      chainSponsorGroup.providers[0].rpcProvider,
      'sponsorWalletAddress1'
    );
    expect(wallets.isBalanceZero).toHaveBeenCalledWith(
      chainSponsorGroup.providers[1].rpcProvider,
      'sponsorWalletAddress1'
    );
    expect(sponsorBalanceStatus).toEqual(expectedSponsorBalanceStatus);
  });

  // This test checks if the function returns null when all providers fail to retrieve the balance.
  it('should return null if balance retrieval fails for all providers', async () => {
    const chainSponsorGroup: wallets.ChainSponsorGroup = {
      chainId: 'chainId1',
      sponsorAddress: 'sponsorAddress1',
      providers: [
        {
          rpcProvider: {
            getBalance: jest.fn().mockRejectedValue(new Error('RPC Error while retrieving balance')),
          } as unknown as RateLimitedProvider,
          chainId: 'chainId1',
          providerName: 'provider1',
        },
        {
          rpcProvider: {
            getBalance: jest.fn().mockRejectedValue(new Error('RPC Error while retrieving balance')),
          } as unknown as RateLimitedProvider,
          chainId: 'chainId1',
          providerName: 'provider2',
        },
      ],
    };

    jest.spyOn(wallets, 'retrieveSponsorWalletAddress').mockImplementation(() => 'sponsorWalletAddress1');
    jest.spyOn(logger, 'warn');

    const expectedSponsorBalanceStatus = null;

    const sponsorBalanceStatus = await wallets.getSponsorBalanceStatus(chainSponsorGroup);

    expect(sponsorBalanceStatus).toEqual(expectedSponsorBalanceStatus);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to get balance for sponsorWalletAddress1. No provider was resolved. Error: All promises were rejected',
      { meta: { 'Chain-ID': chainSponsorGroup.chainId, Sponsor: shortenAddress(chainSponsorGroup.sponsorAddress) } }
    );
  });

  // This test checks if the function returns null when the retrieval of the sponsor wallet fails.
  it('should return null if sponsor wallet retrieval fails', async () => {
    const chainSponsorGroup: wallets.ChainSponsorGroup = {
      chainId: 'chainId1',
      sponsorAddress: 'sponsorAddress1',
      providers: [
        {
          rpcProvider: {
            getBalance: jest.fn().mockResolvedValueOnce(ethers.BigNumber.from('0x0')),
          } as unknown as RateLimitedProvider,
          chainId: 'chainId1',
          providerName: 'provider1',
        },
      ],
    };

    const innerErrMsg = 'Pre-generated private key not found';
    jest.spyOn(wallets, 'retrieveSponsorWalletAddress').mockImplementation(() => {
      throw new Error(innerErrMsg);
    });
    jest.spyOn(logger, 'warn');

    const expectedSponsorBalanceStatus = null;

    const sponsorBalanceStatus = await wallets.getSponsorBalanceStatus(chainSponsorGroup);

    expect(sponsorBalanceStatus).toEqual(expectedSponsorBalanceStatus);
    expect(logger.warn).toHaveBeenCalledWith(
      `Failed to retrieve wallet address for sponsor ${chainSponsorGroup.sponsorAddress}. Skipping. Error: ${innerErrMsg}`,
      { meta: { 'Chain-ID': chainSponsorGroup.chainId, Sponsor: shortenAddress(chainSponsorGroup.sponsorAddress) } }
    );
  });
});

describe('filterSponsorWallets', () => {
  // This test checks if the function correctly updates the state configuration.
  it('should update the state to include only funded sponsors', async () => {
    const stateProviders: state.Providers = {
      1: [
        {
          rpcProvider: {
            getBalance: jest.fn().mockResolvedValue(ethers.BigNumber.from('0x3')),
          } as unknown as RateLimitedProvider,
          chainId: '1',
          providerName: 'provider1',
        },
      ],
      3: [
        {
          rpcProvider: {
            getBalance: jest.fn().mockResolvedValue(ethers.BigNumber.from('0x0')),
          } as unknown as RateLimitedProvider,
          chainId: '3',
          providerName: 'provider2',
        },
      ],
    };
    state.updateState((state) => ({ ...state, providers: stateProviders }));

    const expectedConfig = {
      log: {
        format: 'plain',
        level: 'DEBUG',
      },
      airseekerWalletMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
      triggers: {
        dataFeedUpdates: {
          1: {
            '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
              beacons: [],
              beaconSets: [],
              updateInterval: 30,
            },
          },
        },
      },
    };

    const expectedSponsorWalletsPrivateKey = {
      '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC':
        '0xcda66e77ae4eaab188a15717955f23cb7ee2a15f024eb272a7561cede1be427c',
    };

    jest.spyOn(logger, 'info');
    jest.spyOn(state, 'updateState');
    jest.spyOn(state, 'getState');

    await wallets.filterEmptySponsors();
    const { config: resultedConfig, sponsorWalletsPrivateKey: resultedSponsorWalletsPrivateKey } = state.getState();

    expect(state.updateState).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith(
      'Fetched balances for 3/3 sponsor wallets. Continuing with 1 funded sponsors.'
    );
    expect(resultedConfig).toStrictEqual(expectedConfig);
    expect(resultedSponsorWalletsPrivateKey).toStrictEqual(expectedSponsorWalletsPrivateKey);
  });
});
