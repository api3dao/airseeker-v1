import { ethers } from 'ethers';
import { Config } from './validation';
import * as api from './gas-oracle';
import * as state from './state';
import { BACK_UP_GAS_PRICE_GWEI } from './constants';

const config: Config = {
  airseekerWalletMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
  log: {
    format: 'plain',
    level: 'INFO',
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
    '31337': {
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
        txType: 'eip1559',
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
        baseFeeMultiplier: 2,
        fulfillmentGasLimit: 500_000,
      },
      gasOracle: {
        sampleBlockCount: 6,
        percentile: 60,
        updateInterval: 1,
      },
    },
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
        txType: 'eip1559',
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
        baseFeeMultiplier: 2,
        fulfillmentGasLimit: 500_000,
      },
      gasOracle: {
        sampleBlockCount: 6,
        percentile: 60,
        updateInterval: 1,
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
        txType: 'eip1559',
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
        baseFeeMultiplier: 2,
        fulfillmentGasLimit: 500_000,
      },
      gasOracle: {
        sampleBlockCount: 6,
        percentile: 60,
        updateInterval: 1,
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
      '3317': {
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
          updateInterval: 30,
        },
      },
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
          updateInterval: 30,
        },
      },
      '3': {
        '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
          beacons: [
            {
              beaconId: '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c',
              deviationThreshold: 0.2,
              heartbeatInterval: 86_400,
            },
          ],
          updateInterval: 30,
        },
      },
    },
    beaconSetUpdates: {},
  },
};

describe('Gas oracle', () => {
  const chainId = '31337';
  const providerName = 'local';
  const stateProvider = {
    rpcProvider: new ethers.providers.StaticJsonRpcProvider('http://127.0.0.1:8545/'),
    chainId,
    providerName,
  };
  const chainOptions = { sampleBlockCount: 6, percentile: 60, updateInterval: 1, backupGasPriceGwei: 10 };
  const gasPriceArray = [
    ethers.BigNumber.from(10),
    ethers.BigNumber.from(20),
    ethers.BigNumber.from(30),
    ethers.BigNumber.from(40),
    ethers.BigNumber.from(50),
    ethers.BigNumber.from(60),
    ethers.BigNumber.from(70),
    ethers.BigNumber.from(80),
    ethers.BigNumber.from(90),
    ethers.BigNumber.from(100),
  ];

  beforeEach(() => {
    // Reset state before each test
    state.initializeState(config);
  });

  it('calculates percentileGasPrice', () => {
    const percentileGasPrice = api.getPercentile(70, gasPriceArray);
    expect(percentileGasPrice).toEqual(ethers.BigNumber.from(70));
  });

  it('returns gas price for a provider', async () => {
    const getBlockWithTransactionsSpy = jest.spyOn(
      ethers.providers.StaticJsonRpcProvider.prototype,
      'getBlockWithTransactions'
    );
    const blockDataMock = [
      { number: 6, transactions: [{ gasPrice: ethers.BigNumber.from(60) }] },
      { number: 5, transactions: [{ gasPrice: ethers.BigNumber.from(50) }] },
      { number: 4, transactions: [{ gasPrice: ethers.BigNumber.from(40) }] },
      { number: 3, transactions: [{ gasPrice: ethers.BigNumber.from(30) }] },
      { number: 2, transactions: [{ gasPrice: ethers.BigNumber.from(20) }] },
      { number: 1, transactions: [{ gasPrice: ethers.BigNumber.from(10) }] },
    ];
    blockDataMock.forEach((block) => getBlockWithTransactionsSpy.mockImplementationOnce(async () => block as any));

    const updateBlockDataSpy = jest.spyOn(api, 'updateBlockData');

    const gasPrice = await api.getGasPrice(stateProvider, chainOptions);

    expect(getBlockWithTransactionsSpy).toHaveBeenCalledTimes(chainOptions.sampleBlockCount);
    expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(1, 'latest');
    expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(2, 5);
    expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(3, 4);
    expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(4, 3);
    expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(5, 2);
    expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(6, 1);

    const newBlockDataMock = [
      { blockNumber: 6, gasPrices: [ethers.BigNumber.from(60)] },
      { blockNumber: 5, gasPrices: [ethers.BigNumber.from(50)] },
      { blockNumber: 4, gasPrices: [ethers.BigNumber.from(40)] },
      { blockNumber: 3, gasPrices: [ethers.BigNumber.from(30)] },
      { blockNumber: 2, gasPrices: [ethers.BigNumber.from(20)] },
      { blockNumber: 1, gasPrices: [ethers.BigNumber.from(10)] },
    ];
    expect(updateBlockDataSpy).toHaveBeenCalledWith(
      newBlockDataMock,
      [],
      chainId,
      providerName,
      chainOptions.sampleBlockCount,
      chainOptions.percentile
    );
    expect(gasPrice).toEqual(
      api.getPercentile(
        chainOptions.percentile,
        newBlockDataMock.flatMap((b) => b.gasPrices)
      )
    );
  });

  it('fetches the correct number of blocks', async () => {
    const percentile = 60;
    const sampleBlockCount = 2;
    const getBlockWithTransactionsSpy = jest.spyOn(
      ethers.providers.StaticJsonRpcProvider.prototype,
      'getBlockWithTransactions'
    );
    const blockDataMock = [
      { number: 3, transactions: [{ gasPrice: ethers.BigNumber.from(30) }] },
      { number: 2, transactions: [{ gasPrice: ethers.BigNumber.from(20) }] },
      { number: 1, transactions: [{ gasPrice: ethers.BigNumber.from(10) }] },
    ];
    blockDataMock.forEach((block) => getBlockWithTransactionsSpy.mockImplementationOnce(async () => block as any));

    const updateBlockDataSpy = jest.spyOn(api, 'updateBlockData');

    await api.fetchUpdateBlockData(stateProvider, { ...chainOptions, sampleBlockCount });

    expect(getBlockWithTransactionsSpy).toHaveBeenCalledTimes(sampleBlockCount);
    expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(1, 'latest');
    expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(2, 2);

    const newBlockDataMock = [
      { blockNumber: 3, gasPrices: [ethers.BigNumber.from(30)] },
      { blockNumber: 2, gasPrices: [ethers.BigNumber.from(20)] },
    ];
    expect(updateBlockDataSpy).toHaveBeenCalledWith(
      newBlockDataMock,
      [],
      chainId,
      providerName,
      sampleBlockCount,
      percentile
    );
  });

  it('retries provider getBlockWithTransactions', async () => {
    const getBlockWithTransactionsSpy = jest.spyOn(
      ethers.providers.StaticJsonRpcProvider.prototype,
      'getBlockWithTransactions'
    );
    getBlockWithTransactionsSpy.mockImplementation(async () => {
      throw new Error('some error');
    });
    // Mock random backoff time for prepareGoOptions
    jest.spyOn(global.Math, 'random').mockImplementation(() => 0.15);

    await api.fetchUpdateBlockData(stateProvider, chainOptions);

    expect(getBlockWithTransactionsSpy).toHaveBeenCalledTimes(3);
    expect(state.getState().gasOracles[chainId][providerName].percentileGasPrice).toBeUndefined();
    expect(state.getState().gasOracles[chainId][providerName].backupGasPrice).toEqual(
      ethers.utils.parseUnits(BACK_UP_GAS_PRICE_GWEI.toString(), 'gwei')
    );
  });

  it('updates state with the blockData and percentileGasPrice', () => {
    const newBlockData = [{ blockNumber: 1, gasPrices: gasPriceArray }];

    api.updateBlockData(newBlockData, [], chainId, providerName, 20, 70);

    const percentileGasPrice = api.getPercentile(70, gasPriceArray);
    expect(state.getState().gasOracles[chainId][providerName]).toEqual({
      percentileGasPrice,
      blockData: newBlockData,
    });
  });

  it('applies sampleBlockCount correctly', () => {
    const sampleBlockCount = 11;
    const newSortedBlockData = Array.from(Array(15), (_, i) => ({ blockNumber: i + 1, gasPrices: gasPriceArray })).sort(
      (a, b) => (b.blockNumber > a.blockNumber ? 1 : -1)
    );

    api.updateBlockData(newSortedBlockData, [], chainId, providerName, sampleBlockCount, 70);

    newSortedBlockData.splice(sampleBlockCount);

    const percentileGasPrice = api.getPercentile(70, gasPriceArray);
    expect(state.getState().gasOracles[chainId][providerName].blockData.length).toEqual(sampleBlockCount);
    expect(state.getState().gasOracles[chainId][providerName]).toEqual({
      percentileGasPrice,
      blockData: newSortedBlockData,
    });
  });

  it('returns chainProviderGasPrice for chain-provider pair', () => {
    const newBlockData = [{ blockNumber: 1, gasPrices: gasPriceArray }];

    api.updateBlockData(newBlockData, [], chainId, providerName, 20, 70);

    const percentileGasPrice = api.getPercentile(70, gasPriceArray);
    const chainProviderPercentileGasPrice = api.getChainProviderGasPrice(chainId, providerName);
    expect(percentileGasPrice).toEqual(chainProviderPercentileGasPrice);
    expect(state.getState().gasOracles[chainId][providerName].percentileGasPrice).toEqual(
      chainProviderPercentileGasPrice
    );
  });
});
