import { BigNumber, ethers } from 'ethers';
import { PriorityFee } from '@api3/airnode-node';
import * as state from './state';
import * as gasPrices from './gas-prices';
import { BASE_FEE_MULTIPLIER, PRIORITY_FEE_IN_WEI } from './constants';

const setupMocks = () => {
  jest.spyOn(ethers.providers, 'JsonRpcProvider').mockImplementation(
    () =>
      ({
        getGasPrice: jest.fn(),
        getBlock: jest.fn(),
      } as unknown as ethers.providers.StaticJsonRpcProvider)
  );
  jest.spyOn(state, 'getState').mockImplementation(createMockState);
};

const createProvider = (chainId: string) => ({
  rpcProvider: new ethers.providers.JsonRpcProvider(),
  chainId,
  providerName: 'mock-provider',
});

const createMockState = () =>
  ({
    config: {
      chains: {
        '31337': {
          options: {
            txType: 'legacy',
          },
        },
        '31338': {
          options: {
            txType: 'legacy',
            gasPriceMultiplier: 1.75,
          },
        },
        '31331': {
          options: {
            txType: 'eip1559',
            baseFeeMultiplier: BASE_FEE_MULTIPLIER,
            priorityFee: {
              value: 3.12,
              unit: 'gwei',
            },
          },
        },
        '31332': {
          options: {
            txType: 'eip1559',
            baseFeeMultiplier: undefined,
            priorityFee: {
              value: 3.12,
              unit: 'gwei',
            },
          },
        },
        '31333': {
          options: {
            txType: 'eip1559',
            baseFeeMultiplier: BASE_FEE_MULTIPLIER,
            priorityFee: undefined,
          },
        },
        '31334': {
          options: {
            txType: 'eip1559',
            baseFeeMultiplier: undefined,
            priorityFee: undefined,
          },
        },
      },
    },
  } as unknown as state.State);

const legacyChainId = '31337';
const legacyChainIdWithGasPriceMultiplier = '31338';
const eip1559ChainIds = ['31331', '31332', '31333', '31334'];
const goOptions = {};

describe('parsePriorityFee', () => {
  [
    [{ value: 123, unit: 'wei' }, BigNumber.from('123')],
    [{ value: 123 }, BigNumber.from('123')],
    [{ value: 123.4, unit: 'kwei' }, BigNumber.from('123400')],
    [{ value: 123.4, unit: 'mwei' }, BigNumber.from('123400000')],
    [{ value: 123.4, unit: 'gwei' }, BigNumber.from('123400000000')],
    [{ value: 123.4, unit: 'szabo' }, BigNumber.from('123400000000000')],
    [{ value: 123.4, unit: 'finney' }, BigNumber.from('123400000000000000')],
    [{ value: 123.4, unit: 'ether' }, BigNumber.from('123400000000000000000')],
  ].forEach(([input, result], index) => {
    it(`returns parsed wei from numbers - ${index}`, () => {
      const priorityFeeInWei = gasPrices.parsePriorityFee(input as PriorityFee);
      expect(priorityFeeInWei).toEqual(result);
    });
  });

  [
    { value: 3.12, unit: 'pence' },
    { value: '3.1p', unit: 'gwei' },
    { value: 3.12, unit: 'wei' },
  ].forEach((input, index) => {
    it(`throws an error for an invalid decimal denominated string, number and unit - ${index}`, () => {
      const throwingFunction = () => gasPrices.parsePriorityFee(input as PriorityFee);
      expect(throwingFunction).toThrow();
    });
  });
});

describe('getGasPrice', () => {
  beforeEach(() => {
    setupMocks();
  });

  const baseFeePerGas = ethers.BigNumber.from('93000000000');
  const maxPriorityFeePerGas = BigNumber.from(PRIORITY_FEE_IN_WEI);
  const maxFeePerGas = baseFeePerGas.mul(BASE_FEE_MULTIPLIER).add(maxPriorityFeePerGas);
  const testGasPrice = ethers.BigNumber.from('48000000000');

  eip1559ChainIds.forEach((chainId) => {
    it(`returns the gas price from an EIP-1559 provider - chainId: ${chainId}`, async () => {
      const provider = createProvider(chainId);
      const getBlock = provider.rpcProvider.getBlock as jest.Mock;
      getBlock.mockResolvedValueOnce({
        baseFeePerGas,
      });
      const getGasPrice = provider.rpcProvider.getGasPrice as jest.Mock;

      const gasPrice = (await gasPrices.getGasPrice(provider, goOptions)) as gasPrices.EIP1559GasTarget;
      expect(gasPrice.maxPriorityFeePerGas).toEqual(maxPriorityFeePerGas);
      expect(gasPrice.maxFeePerGas).toEqual(maxFeePerGas);
      expect(getGasPrice).toHaveBeenCalledTimes(0);
      expect(getBlock).toHaveBeenCalledTimes(1);
    });
  });

  it('returns the gas price from a non-EIP-1559 provider', async () => {
    const provider = createProvider(legacyChainId);
    const getBlock = provider.rpcProvider.getBlock as jest.Mock;

    const getGasPrice = provider.rpcProvider.getGasPrice as jest.Mock;
    getGasPrice.mockResolvedValueOnce(testGasPrice);

    const gasPrice = (await gasPrices.getGasPrice(provider, goOptions)) as gasPrices.LegacyGasTarget;
    expect(gasPrice.gasPrice).toEqual(testGasPrice);
    expect(getGasPrice).toHaveBeenCalledTimes(1);
    expect(getBlock).toHaveBeenCalledTimes(0);
  });

  it('applies gasPriceMultiplier to non-EIP-1559 provider', async () => {
    const gasPriceMultiplier = 1.75;
    const provider = createProvider(legacyChainIdWithGasPriceMultiplier);

    const getGasPrice = provider.rpcProvider.getGasPrice as jest.Mock;
    getGasPrice.mockResolvedValueOnce(testGasPrice);

    const gasPrice = (await gasPrices.getGasPrice(provider, goOptions)) as gasPrices.LegacyGasTarget;
    const multipliedTestGasPrice = gasPrices.multiplyGasPrice(testGasPrice, gasPriceMultiplier);

    expect(gasPrice.gasPrice).toEqual(multipliedTestGasPrice);
  });

  eip1559ChainIds.forEach((chainId) => {
    it(`returns null if gas price from an EIP-1559 provider cannot be retrieved - chainId: ${chainId}`, async () => {
      const provider = createProvider(chainId);
      const getBlock = provider.rpcProvider.getBlock as jest.Mock;
      getBlock.mockImplementation(() => {
        throw new Error('Mock error');
      });

      const gasPrice = (await gasPrices.getGasPrice(provider, goOptions)) as gasPrices.EIP1559GasTarget;
      expect(gasPrice).toBeNull();
    });
  });

  it('returns null if gas price from a legacy provider cannot be retrieved', async () => {
    const provider = createProvider(legacyChainId);
    const getGasPrice = provider.rpcProvider.getGasPrice as jest.Mock;
    getGasPrice.mockImplementation(() => {
      throw new Error('Mock error');
    });

    const gasPrice = (await gasPrices.getGasPrice(provider, goOptions)) as gasPrices.LegacyGasTarget;
    expect(gasPrice).toBeNull();
  });
});
