import { DapiServer__factory as DapiServerFactory } from '@api3/airnode-protocol-v1';
import { ethers } from 'ethers';
import * as state from './state';
import * as api from './update-data-feeds';
import * as readDataFeedModule from './read-data-feed-with-id';
import { logger } from './logging';
import { initializeProviders } from './providers';
import { BeaconSetUpdate, BeaconUpdate, Config } from './validation';
import { initializeWallets } from './wallets';
import { validSignedData } from '../test/fixtures';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(15_000);

const config: Config = {
  airseekerWalletMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
  log: {
    format: 'plain',
    level: 'DEBUG',
  },
  endpoints: {},
  ois: [],
  apiCredentials: [],
  beacons: {
    '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c': {
      airnode: '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      templateId: '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
      fetchInterval: 25,
      fetchMethod: 'gateway',
    },
    '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2': {
      airnode: '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290',
      templateId: '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
      // Artificially low interval to make the tests run fast without mocking
      fetchInterval: 0.5,
      fetchMethod: 'gateway',
    },
    '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469be4d6f214e': {
      airnode: '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290',
      templateId: '0x9ec34b00a5019442dcd05a4860ff2bf015164b368cb83fcb756088fc6fbd6480',
      fetchInterval: 40,
      fetchMethod: 'gateway',
    },
    '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd': {
      airnode: '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290',
      templateId: '0x9ec34b00a5019442dcd05a4860ff2bf015164b368cb83fcb756088fcabcdabcd',
      fetchInterval: 40,
      fetchMethod: 'gateway',
    },
  },
  beaconSets: {
    '0x41c3d6e0ee82ae3d33356c4dceb84e98d1a0b361db0f51081fc5a2541ae51683': [
      '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c',
      '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2',
      '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd',
    ],
  },
  chains: {
    '1': {
      contracts: {
        DapiServer: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
      },
      providers: {
        selfHostedMainnet: {
          url: 'https://some.self.hosted.mainnet.url',
        },
        infuraMainnet: {
          url: 'https://some.infura.mainnet.url',
        },
      },
      options: {
        fulfillmentGasLimit: 500000,
        gasPriceOracle: [
          {
            gasPriceStrategy: 'latestBlockPercentileGasPrice',
            percentile: 60,
            minTransactionCount: 20,
            pastToCompareInBlocks: 20,
            maxDeviationMultiplier: 2,
          },
          {
            gasPriceStrategy: 'providerRecommendedGasPrice',
            recommendedGasPriceMultiplier: 1.2,
          },
          {
            gasPriceStrategy: 'constantGasPrice',
            gasPrice: {
              value: 10,
              unit: 'gwei',
            },
          },
        ],
      },
    },
    '3': {
      contracts: {
        DapiServer: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
      },
      providers: {
        infuraRopsten: {
          url: 'https://some.influra.ropsten.url',
        },
      },
      options: {
        fulfillmentGasLimit: 500000,
        gasPriceOracle: [
          {
            gasPriceStrategy: 'constantGasPrice',
            gasPrice: {
              value: 10,
              unit: 'gwei',
            },
          },
        ],
      },
    },
  },
  gateways: {
    '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace': [
      {
        apiKey: '18e06827-8544-4b0f-a639-33df3b5bc62f',
        url: 'https://some.http.signed.data.gateway.url/',
      },
    ],
    '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290': [
      {
        apiKey: '18e06827-8544-4b0f-a639-33df3b5bc62f',
        url: 'https://another.http.signed.data.gateway.url/',
      },
    ],
  },
  templates: {
    '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa': {
      endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
      parameters:
        '0x3173737373730000000000000000000000000000000000000000000000000000746f00000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f70617468000000000000000000000000000000000000000000000000000000726573756c7400000000000000000000000000000000000000000000000000005f74696d65730000000000000000000000000000000000000000000000000000313030303030300000000000000000000000000000000000000000000000000066726f6d000000000000000000000000000000000000000000000000000000004554480000000000000000000000000000000000000000000000000000000000',
    },
    '0x9ec34b00a5019442dcd05a4860ff2bf015164b368cb83fcb756088fc6fbd6480': {
      endpointId: '0xfa102bdb25c5358994a6213ddccdd27a0f310bf4a4d755e29bb74230f91a9d50',
      parameters:
        '0x3173737373730000000000000000000000000000000000000000000000000000746f00000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f70617468000000000000000000000000000000000000000000000000000000726573756c7400000000000000000000000000000000000000000000000000005f74696d65730000000000000000000000000000000000000000000000000000313030303030300000000000000000000000000000000000000000000000000066726f6d000000000000000000000000000000000000000000000000000000004554480000000000000000000000000000000000000000000000000000000000',
    },
    '0x9ec34b00a5019442dcd05a4860ff2bf015164b368cb83fcb756088fcabcdabcd': {
      endpointId: '0xfa102bdb25c5358994a6213ddccdd27a0f310bf4a4d755e29bb74230f91a9d50',
      parameters:
        '0x3173737373730000000000000000000000000000000000000000000000000000746f00000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f70617468000000000000000000000000000000000000000000000000000000726573756c7400000000000000000000000000000000000000000000000000005f74696d65730000000000000000000000000000000000000000000000000000313030303030300000000000000000000000000000000000000000000000000066726f6d000000000000000000000000000000000000000000000000000000004554480000000000000000000000000000000000000000000000000000000000',
    },
  },
  triggers: {
    dataFeedUpdates: {
      '1': {
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
          beacons: [
            {
              beaconId: '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c',
              deviationThreshold: 0.1,
              heartbeatInterval: 86400,
            },
            {
              beaconId: '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2',
              deviationThreshold: 0.7,
              heartbeatInterval: 15_000,
            },
          ],
          beaconSets: [
            {
              beaconSetId: '0x41c3d6e0ee82ae3d33356c4dceb84e98d1a0b361db0f51081fc5a2541ae51683',
              deviationThreshold: 0.1,
              heartbeatInterval: 86400,
            },
          ],
          // Artificially low interval to make the tests run fast without mocking
          updateInterval: 1,
        },
      },
      '3': {
        '0x417B205fEdB1b2352c7996B0F050A7a61544c5e2': {
          beacons: [
            {
              beaconId: '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c',
              deviationThreshold: 0.2,
              heartbeatInterval: 86400,
            },
          ],
          beaconSets: [],
          updateInterval: 40,
        },
      },
    },
  },
};
state.initializeState(config);
initializeProviders();
initializeWallets();

// Can't compare RPC provider instances so comparing groups where the provider is represented by its URL
type ComparableProviderSponsorDataFeeds = {
  provider: string;
  sponsorAddress: string;
  updateInterval: number;
  beacons: BeaconUpdate[];
  beaconSets: BeaconSetUpdate[];
};

const cpsdf: ComparableProviderSponsorDataFeeds[] = [
  {
    provider: 'https://some.self.hosted.mainnet.url',
    sponsorAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    updateInterval: 1,
    beacons: config.triggers.dataFeedUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beacons,
    beaconSets: config.triggers.dataFeedUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beaconSets,
  },
  {
    provider: 'https://some.infura.mainnet.url',
    sponsorAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    updateInterval: 1,
    beacons: config.triggers.dataFeedUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beacons,
    beaconSets: config.triggers.dataFeedUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beaconSets,
  },
  {
    provider: 'https://some.influra.ropsten.url',
    sponsorAddress: '0x417B205fEdB1b2352c7996B0F050A7a61544c5e2',
    updateInterval: 40,
    beacons: config.triggers.dataFeedUpdates['3']['0x417B205fEdB1b2352c7996B0F050A7a61544c5e2'].beacons,
    beaconSets: config.triggers.dataFeedUpdates['3']['0x417B205fEdB1b2352c7996B0F050A7a61544c5e2'].beaconSets,
  },
];

describe('groupDataFeedsByProviderSponsor', () => {
  it('groups dataFeeds by provider+sponsor pair', () => {
    const providerSponsorDataFeedsGroups = api.groupDataFeedsByProviderSponsor();
    const comparableProviderSponsorDataFeedsGroups = providerSponsorDataFeedsGroups.map((psdfg) => ({
      ...psdfg,
      provider: psdfg.provider.rpcProvider.connection.url,
    }));

    expect(providerSponsorDataFeedsGroups).toHaveLength(3);
    expect(comparableProviderSponsorDataFeedsGroups).toContainEqual(cpsdf[0]);
    expect(comparableProviderSponsorDataFeedsGroups).toContainEqual(cpsdf[1]);
    expect(comparableProviderSponsorDataFeedsGroups).toContainEqual(cpsdf[2]);
  });
});

describe('initiateDataFeedUpdates', () => {
  it('initiates beacon updates', async () => {
    const comparableProviderSponsorDataFeedsGroups: ComparableProviderSponsorDataFeeds[] = [];
    jest.spyOn(api, 'updateDataFeedsInLoop').mockImplementation(async (group) => {
      comparableProviderSponsorDataFeedsGroups.push({ ...group, provider: group.provider.rpcProvider.connection.url });
    });

    api.initiateDataFeedUpdates();
    expect(comparableProviderSponsorDataFeedsGroups).toHaveLength(3);
    expect(comparableProviderSponsorDataFeedsGroups).toContainEqual(cpsdf[0]);
    expect(comparableProviderSponsorDataFeedsGroups).toContainEqual(cpsdf[1]);
    expect(comparableProviderSponsorDataFeedsGroups).toContainEqual(cpsdf[2]);
  });
});

describe('updateDataFeedsInLoop', () => {
  it('calls updateBeacons and updateBeaconSets in a loop', async () => {
    const { airseekerWalletPrivateKey, sponsorWalletsPrivateKey } = state.getState();
    const groups = api.groupDataFeedsByProviderSponsor();
    let requestCount = 0;
    jest.spyOn(api, 'updateBeacons').mockImplementation(async () => {
      requestCount++;
    });
    jest.spyOn(api, 'updateBeaconSets');
    jest.spyOn(state, 'getState').mockImplementation(() => {
      if (requestCount === 2) {
        return {
          config,
          stopSignalReceived: true,
          beaconValues: {},
          providers: {},
          airseekerWalletPrivateKey: airseekerWalletPrivateKey,
          sponsorWalletsPrivateKey: sponsorWalletsPrivateKey,
          logOptions: { ...config.log, meta: {} },
        };
      } else {
        return {
          config,
          stopSignalReceived: false,
          beaconValues: {},
          providers: {},
          airseekerWalletPrivateKey: airseekerWalletPrivateKey,
          sponsorWalletsPrivateKey: sponsorWalletsPrivateKey,
          logOptions: { ...config.log, meta: {} },
        };
      }
    });

    await api.updateDataFeedsInLoop(groups[0]);

    expect(api.updateBeacons).toHaveBeenCalledTimes(2);
    expect(api.updateBeaconSets).toHaveBeenCalledTimes(2);
  });
});

describe('updateBeaconSets', () => {
  it('calls updateBeaconSetWithSignedData in DapiServer contract', async () => {
    state.updateState((currentState) => ({
      ...currentState,
      beaconValues: {
        '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c': validSignedData,
        '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2': undefined as any,
        '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd': validSignedData,
      },
    }));

    const txCountSpy = jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getTransactionCount');
    txCountSpy.mockResolvedValueOnce(212);

    const timestamp = 1649664085;
    const readOnChainBeaconDataSpy = jest
      .spyOn(readDataFeedModule, 'readDataFeedWithId')
      .mockReturnValueOnce(Promise.resolve({ timestamp: timestamp - 25, value: ethers.BigNumber.from(40000000000) }))
      .mockReturnValueOnce(
        Promise.resolve({
          timestamp: timestamp - 30,
          value: ethers.BigNumber.from(41000000000),
        })
      );

    const updateBeaconSetWithSignedDataSpy = jest.fn();
    const updateBeaconSetWithSignedDataMock = updateBeaconSetWithSignedDataSpy.mockImplementation(async () => ({
      hash: ethers.utils.hexlify(ethers.utils.randomBytes(32)),
    }));
    jest.spyOn(DapiServerFactory, 'connect').mockImplementation(
      (_dapiServerAddress, _provider) =>
        ({
          connect(_signerOrProvider: ethers.Signer | ethers.providers.Provider | string) {
            return this;
          },
          updateBeaconSetWithSignedData: updateBeaconSetWithSignedDataMock,
        } as any)
    );

    const groups = api.groupDataFeedsByProviderSponsor();

    await api.updateBeaconSets(groups[0], Date.now());

    expect(readOnChainBeaconDataSpy).toHaveBeenCalled();
    expect(updateBeaconSetWithSignedDataSpy).toHaveBeenCalledWith(
      [
        '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
        '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290',
        '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290',
      ],
      [
        '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
        '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
        '0x9ec34b00a5019442dcd05a4860ff2bf015164b368cb83fcb756088fcabcdabcd',
      ],
      [validSignedData.timestamp, expect.any(String), validSignedData.timestamp],
      [validSignedData.encodedValue, '0x', validSignedData.encodedValue],
      [validSignedData.signature, expect.any(String), validSignedData.signature],
      expect.objectContaining({
        gasLimit: expect.any(ethers.BigNumber),
        gasPrice: expect.any(ethers.BigNumber),
        nonce: 212,
        type: 0,
      })
    );
  });

  it(`returns undefined if transaction count can't be retrieved`, async () => {
    state.updateState((currentState) => ({
      ...currentState,
      beaconValues: {
        '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c': validSignedData,
        '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2': validSignedData,
        '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd': validSignedData,
      },
    }));
    jest.spyOn(logger, 'warn');

    const txCountSpy = jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getTransactionCount');
    txCountSpy.mockRejectedValue(new Error('cannot fetch transaction count'));

    // For reading on-chain data that causes to update beaconSet
    const timestamp = 1649664085;
    const readOnChainBeaconDataSpy = jest
      .spyOn(readDataFeedModule, 'readDataFeedWithId')
      .mockReturnValueOnce(Promise.resolve({ timestamp: timestamp - 25, value: ethers.BigNumber.from(40000000000) }));

    const groups = api.groupDataFeedsByProviderSponsor();

    expect(await api.updateBeaconSets(groups[0], Date.now())).toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(`Unable to fetch transaction count`, { meta: expect.anything() });
    expect(readOnChainBeaconDataSpy).toHaveBeenCalledTimes(1);
  });
});

describe('decodeBeaconValue', () => {
  it('returns decoded value', () => {
    expect(api.decodeBeaconValue(validSignedData.encodedValue)).toEqual(ethers.BigNumber.from(42350000000));
  });

  it('returns null for value higher than the type range', () => {
    // INT224_MAX + 1
    const bigEncodedValue = '0x0000000080000000000000000000000000000000000000000000000000000000';
    expect(api.decodeBeaconValue(bigEncodedValue)).toBeNull();
  });

  it('returns null for value lower than the type range', () => {
    // INT224_MIN - 1
    const bigEncodedValue = '0xffffffff7fffffffffffffffffffffffffffffffffffffffffffffffffffffff';
    expect(api.decodeBeaconValue(bigEncodedValue)).toBeNull();
  });
});

describe('initializeUpdateCycle', () => {
  it('returns initial update data', async () => {
    state.updateState((currentState) => ({
      ...currentState,
      beaconValues: {
        '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c': validSignedData,
        '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2': undefined as any,
        '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd': validSignedData,
      },
    }));

    const groups = api.groupDataFeedsByProviderSponsor();
    const initialUpdateData = await api.initializeUpdateCycle(groups[0], api.DataFeedType.Beacon);
    const {
      contract,
      sponsorWallet,
      voidSigner,
      totalTimeout,
      logOptions,
      beaconValues,
      beacons,
      beaconSets,
      config: initConfig,
      provider,
    } = initialUpdateData!;

    expect(contract.address).toEqual('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0');
    expect(sponsorWallet.address).toEqual('0x1129eEDf4996cF133e0e9555d4c9d305c9918EC5');
    expect(voidSigner.address).toEqual(ethers.constants.AddressZero);
    expect(totalTimeout).toEqual(1_000);
    expect(logOptions).toEqual({
      meta: { 'Chain-ID': '1', Provider: 'selfHostedMainnet', Sponsor: '0x3C4...93BC', DataFeedType: 'Beacon' },
    });
    expect(beaconValues).toEqual({
      '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c': validSignedData,
      '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2': undefined,
      '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd': validSignedData,
    });
    expect(beacons).toEqual(groups[0].beacons);
    expect(beaconSets).toEqual(groups[0].beaconSets);
    expect(initConfig).toEqual(config);
    expect(provider).toEqual(groups[0].provider);
  });
});
