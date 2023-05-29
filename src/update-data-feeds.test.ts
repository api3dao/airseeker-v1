import { Api3ServerV1__factory as Api3ServerV1Factory } from '@api3/airnode-protocol-v1';
import { ethers } from 'ethers';
import { initializeProviders } from './providers';
import * as state from './state';
import * as api from './update-data-feeds';
import { BeaconSetTrigger, BeaconTrigger, Config } from './validation';
import { initializeWallets } from './wallets';
import { buildGatewayLimiters, buildApiLimiters } from './state';
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
        Api3ServerV1: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
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
        Api3ServerV1: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
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
  beaconTriggers: BeaconTrigger[];
  beaconSetTriggers: BeaconSetTrigger[];
};

const cpsdf: ComparableProviderSponsorDataFeeds[] = [
  {
    provider: 'https://some.self.hosted.mainnet.url',
    sponsorAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    updateInterval: 1,
    beaconTriggers: config.triggers.dataFeedUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beacons,
    beaconSetTriggers: config.triggers.dataFeedUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beaconSets,
  },
  {
    provider: 'https://some.infura.mainnet.url',
    sponsorAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    updateInterval: 1,
    beaconTriggers: config.triggers.dataFeedUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beacons,
    beaconSetTriggers: config.triggers.dataFeedUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beaconSets,
  },
  {
    provider: 'https://some.influra.ropsten.url',
    sponsorAddress: '0x417B205fEdB1b2352c7996B0F050A7a61544c5e2',
    updateInterval: 40,
    beaconTriggers: config.triggers.dataFeedUpdates['3']['0x417B205fEdB1b2352c7996B0F050A7a61544c5e2'].beacons,
    beaconSetTriggers: config.triggers.dataFeedUpdates['3']['0x417B205fEdB1b2352c7996B0F050A7a61544c5e2'].beaconSets,
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
    jest.spyOn(api, 'updateBeaconSets').mockImplementation(jest.fn());
    jest.spyOn(state, 'getState').mockImplementation(() => {
      if (requestCount === 2) {
        return {
          config,
          gatewaysWithLimiters: buildGatewayLimiters(config.gateways),
          apiLimiters: buildApiLimiters(config),
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
          gatewaysWithLimiters: buildGatewayLimiters(config.gateways),
          apiLimiters: buildApiLimiters(config),
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
  it('calls updateBeaconSetWithBeacons in Api3ServerV1 contract', async () => {
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

    const tryMulticallMock = jest
      .fn()
      .mockReturnValueOnce({ hash: ethers.utils.hexlify(ethers.utils.randomBytes(32)) });
    const callStaticTryMulticallMock = jest
      .fn()
      .mockReturnValueOnce({
        successes: [true],
        returndata: [
          ethers.utils.defaultAbiCoder.encode(
            ['int224', 'uint32'],
            [ethers.BigNumber.from(40000000000), timestamp - 25]
          ),
        ],
      })
      .mockReturnValueOnce({
        successes: [true, true, true],
        returndata: [
          ethers.utils.defaultAbiCoder.encode(
            ['int224', 'uint32'],
            [ethers.BigNumber.from(41000000000), timestamp - 30]
          ),
          ethers.utils.defaultAbiCoder.encode(['int224', 'uint32'], [ethers.BigNumber.from(40000000000), timestamp]),
          ethers.utils.defaultAbiCoder.encode(['int224', 'uint32'], [ethers.BigNumber.from(40000000000), timestamp]),
        ],
      });
    jest.spyOn(Api3ServerV1Factory, 'connect').mockImplementation(
      (_dapiServerAddress, _provider) =>
        ({
          connect(_signerOrProvider: ethers.Signer | ethers.providers.Provider | string) {
            return this;
          },
          tryMulticall: tryMulticallMock,
          interface: {
            encodeFunctionData: (functionFragment: string, values: [any]): string => {
              if (functionFragment === 'dataFeeds')
                return '0x67a7cfb741c3d6e0ee82ae3d33356c4dceb84e98d1a0b361db0f51081fc5a2541ae51683';

              if (functionFragment === 'readDataFeedWithId') {
                switch (values[0]) {
                  case '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c':
                    return '0xa5fc076f2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c';
                  case '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2':
                    return '0xa5fc076fa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2';
                  case '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd':
                    return '0xa5fc076f8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd';
                }
              }

              if (functionFragment === 'updateBeaconWithSignedData')
                return '0x1a0a0b3e0000000000000000000000005656d3a378b1aadfddcf4196ea364a9d786172909ec34b00a5019442dcd05a4860ff2bf015164b368cb83fcb756088fcabcdabcd000000000000000000000000000000000000000000000000000000006253e05500000000000000000000000000000000000000000000000000000000000000a000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000002000000000000000000000000000000000000000000000000000000009dc41b78000000000000000000000000000000000000000000000000000000000000000418aace553ec28f53cc976c8a2469d50f16de121d248495117aca36feb4950957827570e0648f82bdbc0afa6cb69dd9fe37dc7f9d58ae3aa06450e627e06c1b8031b00000000000000000000000000000000000000000000000000000000000000';

              if (functionFragment === 'updateBeaconSetWithBeacons')
                return '0x00aae33f00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000002924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5bf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990';

              return '';
            },
          },
          callStatic: { tryMulticall: callStaticTryMulticallMock },
        } as any)
    );

    const groups = api.groupDataFeedsByProviderSponsor();

    await api.updateBeaconSets(groups[0], Date.now());

    expect(callStaticTryMulticallMock).toHaveBeenCalledTimes(2);
    expect(tryMulticallMock).toHaveBeenCalledTimes(1);
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

    const txCountSpy = jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getTransactionCount');
    txCountSpy.mockResolvedValueOnce(212);

    const groups = api.groupDataFeedsByProviderSponsor();
    const initialUpdateData = await api.initializeUpdateCycle(groups[0], api.DataFeedType.Beacon, Date.now());
    const {
      contract,
      sponsorWallet,
      transactionCount,
      voidSigner,
      totalTimeout,
      logOptions,
      beaconValues,
      beaconTriggers,
      beaconSetTriggers,
      config: initConfig,
      provider,
    } = initialUpdateData!;

    expect(contract.address).toEqual('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512');
    expect(sponsorWallet.address).toEqual('0x1129eEDf4996cF133e0e9555d4c9d305c9918EC5');
    expect(transactionCount).toEqual(212);
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
    expect(beaconTriggers).toEqual(groups[0].beaconTriggers);
    expect(beaconSetTriggers).toEqual(groups[0].beaconSetTriggers);
    expect(initConfig).toEqual(config);
    expect(provider).toEqual(groups[0].provider);
  });

  it(`returns null if transaction count can't be retrieved`, async () => {
    const getTransactionCountSpy = jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getTransactionCount');
    getTransactionCountSpy.mockRejectedValueOnce('Error');

    const groups = api.groupDataFeedsByProviderSponsor();
    expect(await api.initializeUpdateCycle(groups[0], api.DataFeedType.Beacon, Date.now())).toBeNull();
  });

  it('returns null if no feeds are found for selected data feed type', async () => {
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

    const groups = api.groupDataFeedsByProviderSponsor();

    // Sponsor `0x417B205fEdB1b2352c7996B0F050A7a61544c5e2` on chain `3` have no beacon set
    const group = groups.find(
      ({ sponsorAddress, provider }) =>
        sponsorAddress === '0x417B205fEdB1b2352c7996B0F050A7a61544c5e2' && provider.chainId === '3'
    );
    expect(await api.initializeUpdateCycle(group as any, api.DataFeedType.BeaconSet, Date.now())).toBeNull();
  });
});
