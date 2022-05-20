import { ethers } from 'ethers';
import { Config } from './validation';
import * as api from './gas-oracle';
import * as state from './state';
import {
  GAS_ORACLE_MAX_TIMEOUT,
  GAS_PRICE_PERCENTILE,
  GAS_PRICE_DEVIATION_THRESHOLD,
  BACK_UP_GAS_PRICE_GWEI,
  MIN_BLOCK_TRANSACTIONS,
} from './constants';

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
        txType: 'legacy',
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
        baseFeeMultiplier: 2,
        fulfillmentGasLimit: 500_000,
      },
      gasOracle: {
        percentile: 60,
        maxTimeout: 1,
        minBlockTransactions: 20,
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
        txType: 'legacy',
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
        baseFeeMultiplier: 2,
        fulfillmentGasLimit: 500_000,
      },
      gasOracle: {
        percentile: 60,
        maxTimeout: 1,
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
        txType: 'legacy',
        priorityFee: {
          value: 3.12,
          unit: 'gwei',
        },
        baseFeeMultiplier: 2,
        fulfillmentGasLimit: 500_000,
      },
      gasOracle: {
        percentile: 60,
        maxTimeout: 1,
        minBlockTransactions: 20,
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
  const chainOptions = {
    percentile: 60,
    maxTimeout: 1,
    backupGasPriceGwei: 10,
    minBlockTransactions: 3,
    gasPriceDeviationThreshold: 20,
  };
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

  describe('getPercentile', () => {
    it('calculates percentileGasPrice', () => {
      const percentileGasPrice = api.getPercentile(70, gasPriceArray);
      expect(percentileGasPrice).toEqual(ethers.BigNumber.from(70));
    });
  });

  describe('getChainProviderConfig', () => {
    it('returns config settings', () => {
      const gasOracleConfig = api.getChainProviderConfig({
        percentile: 60,
        maxTimeout: 1,
        backupGasPriceGwei: 10,
        minBlockTransactions: 3,
        gasPriceDeviationThreshold: 20,
      });
      expect(gasOracleConfig).toEqual({
        percentile: 60,
        maxTimeout: 1,
        backupGasPriceGwei: 10,
        minBlockTransactions: 3,
        gasPriceDeviationThreshold: 20,
      });
    });

    it('returns default settings', () => {
      const gasOracleConfig = api.getChainProviderConfig();
      expect(gasOracleConfig).toEqual({
        percentile: GAS_PRICE_PERCENTILE,
        maxTimeout: GAS_ORACLE_MAX_TIMEOUT,
        backupGasPriceGwei: BACK_UP_GAS_PRICE_GWEI,
        minBlockTransactions: MIN_BLOCK_TRANSACTIONS,
        gasPriceDeviationThreshold: GAS_PRICE_DEVIATION_THRESHOLD,
      });
    });
  });

  describe('getOracleGasPrice', () => {
    it('returns gas price', async () => {
      const getBlockWithTransactionsSpy = jest.spyOn(
        ethers.providers.StaticJsonRpcProvider.prototype,
        'getBlockWithTransactions'
      );
      const blockDataMock = [
        {
          number: 23,
          transactions: [
            { gasPrice: ethers.BigNumber.from(22) },
            { gasPrice: ethers.BigNumber.from(22) },
            { gasPrice: ethers.BigNumber.from(22) },
          ],
        },
        {
          number: 3,
          transactions: [
            { gasPrice: ethers.BigNumber.from(20) },
            { gasPrice: ethers.BigNumber.from(20) },
            { gasPrice: ethers.BigNumber.from(20) },
          ],
        },
      ];
      blockDataMock.forEach((block) => getBlockWithTransactionsSpy.mockImplementationOnce(async () => block as any));

      const gasPrice = await api.getOracleGasPrice(stateProvider, chainOptions);

      expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(1, 'latest');
      expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(2, -20);

      expect(gasPrice).toEqual(ethers.BigNumber.from(22));
    });

    it('returns getGasPrice as fallback if not enough blocks', async () => {
      const getBlockWithTransactionsSpy = jest.spyOn(
        ethers.providers.StaticJsonRpcProvider.prototype,
        'getBlockWithTransactions'
      );

      const blockDataMock = [
        {
          number: 23,
          transactions: [{ gasPrice: ethers.BigNumber.from(22) }, { gasPrice: ethers.BigNumber.from(22) }],
        },
        {
          number: 3,
          transactions: [{ gasPrice: ethers.BigNumber.from(20) }, { gasPrice: ethers.BigNumber.from(20) }],
        },
      ];
      blockDataMock.forEach((block) => getBlockWithTransactionsSpy.mockImplementationOnce(async () => block as any));
      const getGasPriceSpy = jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getGasPrice');
      const getGasPriceMock = ethers.BigNumber.from(11);
      getGasPriceSpy.mockImplementationOnce(async () => getGasPriceMock);

      const gasPrice = await api.getOracleGasPrice(stateProvider, chainOptions);

      expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(1, 'latest');
      expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(2, -20);

      expect(gasPrice).toEqual(ethers.BigNumber.from(getGasPriceMock));
    });

    it('returns config backupGasPriceGwei gas if not enough blocks and fallback fails', async () => {
      const getBlockWithTransactionsSpy = jest.spyOn(
        ethers.providers.StaticJsonRpcProvider.prototype,
        'getBlockWithTransactions'
      );
      const blockDataMock = [
        {
          number: 23,
          transactions: [{ gasPrice: ethers.BigNumber.from(22) }, { gasPrice: ethers.BigNumber.from(22) }],
        },
        {
          number: 3,
          transactions: [{ gasPrice: ethers.BigNumber.from(20) }, { gasPrice: ethers.BigNumber.from(20) }],
        },
      ];
      blockDataMock.forEach((block) => getBlockWithTransactionsSpy.mockImplementationOnce(async () => block as any));
      const getGasPriceSpy = jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getGasPrice');
      getGasPriceSpy.mockImplementationOnce(async () => {
        throw new Error('some error');
      });

      const gasPrice = await api.getOracleGasPrice(stateProvider, chainOptions);

      expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(1, 'latest');
      expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(2, -20);

      expect(gasPrice).toEqual(ethers.utils.parseUnits(chainOptions.backupGasPriceGwei.toString(), 'gwei'));
    });

    it('returns config backupGasPriceGwei gas if failing to fetch both blocks and fallback', async () => {
      const getBlockWithTransactionsSpy = jest.spyOn(
        ethers.providers.StaticJsonRpcProvider.prototype,
        'getBlockWithTransactions'
      );
      getBlockWithTransactionsSpy.mockImplementation(async () => {
        throw new Error('some error');
      });
      const getGasPriceSpy = jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getGasPrice');
      getGasPriceSpy.mockImplementation(async () => {
        throw new Error('some error');
      });

      const gasPrice = await api.getOracleGasPrice(stateProvider, chainOptions);

      expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(1, 'latest');
      expect(getBlockWithTransactionsSpy).toHaveBeenNthCalledWith(2, -20);

      expect(gasPrice).toEqual(ethers.utils.parseUnits(chainOptions.backupGasPriceGwei.toString(), 'gwei'));
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
      jest.spyOn(global.Math, 'random').mockImplementation(() => 0.3);

      const gasPrice = await api.fetchBlockData(stateProvider, chainOptions);

      expect(getBlockWithTransactionsSpy).toHaveBeenCalledTimes(4);
      expect(gasPrice).toEqual(ethers.utils.parseUnits(BACK_UP_GAS_PRICE_GWEI.toString(), 'gwei'));
    });

    it('retries provider getGasPrice', async () => {
      const getBlockWithTransactionsSpy = jest.spyOn(
        ethers.providers.StaticJsonRpcProvider.prototype,
        'getBlockWithTransactions'
      );
      getBlockWithTransactionsSpy.mockImplementation(async () => {
        throw new Error('some error');
      });
      const getGasPriceSpy = jest.spyOn(ethers.providers.StaticJsonRpcProvider.prototype, 'getGasPrice');
      getGasPriceSpy.mockImplementationOnce(async () => {
        throw new Error('some error');
      });
      // Mock random backoff time for prepareGoOptions
      jest.spyOn(global.Math, 'random').mockImplementation(() => 0.3);

      const gasPrice = await api.fetchBlockData(stateProvider, chainOptions);

      expect(getBlockWithTransactionsSpy).toHaveBeenCalledTimes(4);
      expect(getBlockWithTransactionsSpy).toHaveBeenCalledTimes(4);
      expect(gasPrice).toEqual(ethers.utils.parseUnits(BACK_UP_GAS_PRICE_GWEI.toString(), 'gwei'));
    });
  });
});
