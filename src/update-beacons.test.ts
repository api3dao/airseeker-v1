import { ethers } from 'ethers';
import { logger } from './logging';
import * as state from './state';
import { BeaconUpdate, Config } from './validation';
import { initializeProviders } from './providers';
import * as api from './update-beacons';
import * as utils from './utils';
import { getUnixTimestamp } from '../test/fixtures';

const config: Config = {
  airseekerWalletMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
  log: {
    format: 'plain',
    level: 'DEBUG',
  },
  beacons: {
    '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c': {
      airnode: '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      templateId: '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
      fetchInterval: 25,
    },
    '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2': {
      airnode: '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290',
      templateId: '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
      // Artificially low interval to make the tests run fast without mocking
      fetchInterval: 0.5,
    },
    '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469be4d6f214e': {
      airnode: '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290',
      templateId: '0x9ec34b00a5019442dcd05a4860ff2bf015164b368cb83fcb756088fc6fbd6480',
      fetchInterval: 40,
    },
    '0x8fa9d00cb8f2d95b1299623d97a97696ed03d0e3350e4ea638f469beabcdabcd': {
      airnode: '0x5656D3A378B1AAdFDDcF4196ea364A9d78617290',
      templateId: '0x9ec34b00a5019442dcd05a4860ff2bf015164b368cb83fcb756088fcabcdabcd',
      fetchInterval: 40,
    },
  },
  beaconSets: {},
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
        txType: 2,
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
        baseFeeMultiplier: 2,
        fulfillmentGasLimit: 500_000,
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
        txType: 2,
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
        baseFeeMultiplier: 2,
        fulfillmentGasLimit: 500_000,
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
    beaconUpdates: {
      '1': {
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
          beacons: [
            {
              beaconId: '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c',
              deviationThreshold: 0.1,
              heartbeatInterval: 86_400,
            },
            {
              beaconId: '0xa5ddf304a7dcec62fa55449b7fe66b33339fd8b249db06c18423d5b0da7716c2',
              deviationThreshold: 0.7,
              heartbeatInterval: 15_000,
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
              heartbeatInterval: 86_400,
            },
          ],
          updateInterval: 40,
        },
      },
    },
    beaconSetUpdates: {},
  },
};
state.initializeState(config);
initializeProviders();

// Can't compare RPC provider instances so comparing groups where the provider is represented by its URL
type ComparableProviderSponsorBeacons = {
  provider: string;
  sponsorAddress: string;
  updateInterval: number;
  beacons: BeaconUpdate[];
};

const cpsbg: ComparableProviderSponsorBeacons[] = [
  {
    provider: 'https://some.self.hosted.mainnet.url',
    sponsorAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    updateInterval: 1,
    beacons: config.triggers.beaconUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beacons,
  },
  {
    provider: 'https://some.infura.mainnet.url',
    sponsorAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
    updateInterval: 1,
    beacons: config.triggers.beaconUpdates['1']['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'].beacons,
  },
  {
    provider: 'https://some.influra.ropsten.url',
    sponsorAddress: '0x417B205fEdB1b2352c7996B0F050A7a61544c5e2',
    updateInterval: 40,
    beacons: config.triggers.beaconUpdates['3']['0x417B205fEdB1b2352c7996B0F050A7a61544c5e2'].beacons,
  },
];

describe('groupBeaconsByProviderSponsor', () => {
  it('groups beacons by provider+sponsor pair', () => {
    const providerSponsorBeaconsGroups = api.groupBeaconsByProviderSponsor();
    const comparableProviderSponsorBeaconsGroups = providerSponsorBeaconsGroups.map((psbg) => ({
      ...psbg,
      provider: psbg.provider.rpcProvider.connection.url,
    }));

    expect(providerSponsorBeaconsGroups).toHaveLength(3);
    expect(comparableProviderSponsorBeaconsGroups).toContainEqual(cpsbg[0]);
    expect(comparableProviderSponsorBeaconsGroups).toContainEqual(cpsbg[1]);
    expect(comparableProviderSponsorBeaconsGroups).toContainEqual(cpsbg[2]);
  });
});

describe('initiateBeaconUpdates', () => {
  it('initiates beacon updates', async () => {
    const comparableProviderSponsorBeaconsGroups: ComparableProviderSponsorBeacons[] = [];
    jest.spyOn(api, 'updateBeaconsInLoop').mockImplementation(async (group) => {
      comparableProviderSponsorBeaconsGroups.push({ ...group, provider: group.provider.rpcProvider.connection.url });
    });

    api.initiateBeaconUpdates();
    expect(comparableProviderSponsorBeaconsGroups).toHaveLength(3);
    expect(comparableProviderSponsorBeaconsGroups).toContainEqual(cpsbg[0]);
    expect(comparableProviderSponsorBeaconsGroups).toContainEqual(cpsbg[1]);
    expect(comparableProviderSponsorBeaconsGroups).toContainEqual(cpsbg[2]);
  });
});

describe('updateBeaconsInLoop', () => {
  it('calls updateBeacons in a loop', async () => {
    const groups = api.groupBeaconsByProviderSponsor();
    let requestCount = 0;
    jest.spyOn(api, 'updateBeacons').mockImplementation(async () => {
      requestCount++;
    });
    jest.spyOn(state, 'getState').mockImplementation(() => {
      if (requestCount === 2) {
        return {
          config,
          stopSignalReceived: true,
          beaconValues: {},
          providers: {},
          gasOracles: {},
          logOptions: { ...config.log, meta: {} },
        };
      } else {
        return {
          config,
          stopSignalReceived: false,
          beaconValues: {},
          providers: {},
          gasOracles: {},
          logOptions: { ...config.log, meta: {} },
        };
      }
    });

    await api.updateBeaconsInLoop(groups[0]);

    expect(api.updateBeacons).toHaveBeenCalledTimes(2);
  });
});

describe('calculateTimeout', () => {
  it('calculates the remaining time for timeout', () => {
    const startTime = 1650548022000;
    const totalTimeout = 3000;
    jest.spyOn(Date, 'now').mockReturnValue(1650548023000);

    expect(utils.calculateTimeout(startTime, totalTimeout)).toEqual(2000);
  });
});

describe('prepareGoOptions', () => {
  it('prepares options for the go function', () => {
    const startTime = 1650548022000;
    const totalTimeout = 3000;
    jest.spyOn(Date, 'now').mockReturnValue(1650548023000);

    const expectedGoOptions = {
      attemptTimeoutMs: 5_000,
      totalTimeoutMs: 2000,
      retries: 100_000,
      delay: { type: 'random' as const, minDelayMs: 0, maxDelayMs: 2_500 },
    };
    expect(utils.prepareGoOptions(startTime, totalTimeout)).toEqual(expectedGoOptions);
  });
});

it('readOnChainBeaconData', async () => {
  jest.spyOn(logger, 'warn');
  const feedValue = { value: ethers.BigNumber.from('123'), timestamp: getUnixTimestamp('2019-3-21') };
  const readDataFeedWithIdMock = jest
    .fn()
    .mockRejectedValueOnce(new Error('cannot read chain'))
    .mockRejectedValueOnce(new Error('some other error'))
    .mockResolvedValue(feedValue);

  const dapiServer: any = {
    address: ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20))),
    connect() {
      return this;
    },
    readDataFeedWithId: readDataFeedWithIdMock,
  };

  const providerUrl = 'http://127.0.0.1:8545/';
  const voidSigner = new ethers.VoidSigner(
    ethers.constants.AddressZero,
    new ethers.providers.JsonRpcProvider(providerUrl)
  );

  const onChainBeaconData = await api.readOnChainBeaconData(
    voidSigner,
    dapiServer,
    'some-id',
    { retries: 100_000 },
    {}
  );

  expect(onChainBeaconData).toEqual(feedValue);
  expect(logger.warn).toHaveBeenCalledTimes(2);
  expect(logger.warn).toHaveBeenNthCalledWith(1, 'Failed attempt to read data feed. Error: Error: cannot read chain', {
    additional: { 'Dapi-Server': dapiServer.address },
  });
  expect(logger.warn).toHaveBeenNthCalledWith(2, 'Failed attempt to read data feed. Error: Error: some other error', {
    additional: { 'Dapi-Server': dapiServer.address },
  });
});
