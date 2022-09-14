import * as hre from 'hardhat';
import { BigNumber } from 'ethers';
import '@nomiclabs/hardhat-ethers';
import { PriorityFee } from '@api3/airnode-utilities';
import * as gasOracle from '../../src/gas-oracle';
import * as state from '../../src/state';
import * as providersApi from '../../src/providers';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { executeTransactions } from '../setup/transactions';
import { GasOracleConfig } from '../../src/validation';
import { parsePriorityFee } from '../../src/utils';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const chainId = '31337';
const providerName = 'local';
const providerUrl = 'http://127.0.0.1:8545/';
const provider = new hre.ethers.providers.StaticJsonRpcProvider(providerUrl);
const airseekerConfig = buildAirseekerConfig();
const secretsConfig = buildLocalSecrets();
const gasOracleConfig = airseekerConfig.chains[chainId].options.gasOracle;
process.env = Object.assign(process.env, secretsConfig);

const processBlockData = async (
  blocksWithGasPrices: { blockNumber: number; gasPrices: BigNumber[] }[],
  percentile: number,
  maxDeviationMultiplier: number,
  fallbackGasPrice: PriorityFee
) => {
  const latestBlock = blocksWithGasPrices[0];
  const referenceBlock = blocksWithGasPrices[20];

  const latestBlockPercentileGasPrice = gasOracle.getPercentile(
    gasOracleConfig.latestGasPriceOptions.percentile,
    latestBlock.gasPrices.map((p) => p)
  );
  const referenceBlockPercentileGasPrice = gasOracle.getPercentile(
    percentile,
    referenceBlock.gasPrices.map((p) => p)
  );

  const isWithinDeviationLimit = gasOracle.checkMaxDeviationLimit(
    latestBlockPercentileGasPrice!,
    referenceBlockPercentileGasPrice!,
    maxDeviationMultiplier
  );

  if (isWithinDeviationLimit) return latestBlockPercentileGasPrice;

  try {
    return await provider.getGasPrice();
  } catch (_e) {
    return parsePriorityFee(fallbackGasPrice);
  }
};

describe('Gas oracle', () => {
  const txTypes: ('legacy' | 'eip1559')[] = ['legacy', 'eip1559'];

  txTypes.forEach((txType) => {
    describe(`${txType} network`, () => {
      let blocksWithGasPrices: { blockNumber: number; gasPrices: BigNumber[] }[];

      beforeEach(async () => {
        // Reset the local hardhat network state for each test to prevent issues with other test contracts
        await hre.network.provider.send('hardhat_reset');
        // Set the net block timestamp to current time in seconds
        await hre.network.provider.send('evm_setNextBlockTimestamp', [Math.floor(Date.now() / 1000)]);
        // Mine the next block to set the timestamp for the following test
        await hre.network.provider.send('evm_mine');

        // Disable automining to get multiple transaction per block
        await hre.network.provider.send('evm_setAutomine', [false]);
        jest.restoreAllMocks();

        const transactions = await executeTransactions(txType);

        blocksWithGasPrices = transactions.blocksWithGasPrices.sort((a, b) => b.blockNumber - a.blockNumber);

        // Set automining to true
        await hre.network.provider.send('evm_setAutomine', [true]);
      });

      it('gets oracle gas price for provider', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].options.gasOracle;

        const gasPrice = await gasOracle.getOracleGasPrice(
          { ...provider, providerName },
          gasOracle.getChainProviderConfig(gasOracleConfig as GasOracleConfig)
        );

        const processedPercentileGasPrice = await processBlockData(
          blocksWithGasPrices,
          gasOracleConfig.latestGasPriceOptions.percentile,
          gasOracleConfig.latestGasPriceOptions.maxDeviationMultiplier,
          gasOracleConfig.fallbackGasPrice as PriorityFee
        );

        expect(gasPrice).toEqual(processedPercentileGasPrice);
      });

      it('uses fallback getGasPrice when maxDeviationMultiplier is exceeded', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = {
          ...airseekerConfig.chains[chainId].options.gasOracle,
          latestGasPriceOptions: {
            ...airseekerConfig.chains[chainId].options.gasOracle.latestGasPriceOptions,
            maxDeviationMultiplier: 0.01, // Set a low maxDeviationMultiplier to test getGasPrice fallback
          },
        };

        gasOracleConfig;

        const gasPrice = await gasOracle.getOracleGasPrice(
          { ...provider, providerName },
          gasOracle.getChainProviderConfig(gasOracleConfig as GasOracleConfig)
        );
        const fallbackGasPrice = await provider.rpcProvider.getGasPrice();

        expect(gasPrice).toEqual(fallbackGasPrice);
      });

      it('uses fallback getGasPrice when getBlockWithTransactions provider calls fail', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].options.gasOracle;

        const getBlockWithTransactionsSpy = jest.spyOn(
          hre.ethers.providers.StaticJsonRpcProvider.prototype,
          'getBlockWithTransactions'
        );
        getBlockWithTransactionsSpy.mockImplementation(async () => {
          throw new Error('some error');
        });

        const gasPrice = await gasOracle.getOracleGasPrice(
          { ...provider, providerName },
          gasOracle.getChainProviderConfig(gasOracleConfig as GasOracleConfig)
        );
        const fallbackGasPrice = await provider.rpcProvider.getGasPrice();

        expect(gasPrice).toEqual(fallbackGasPrice);
      });

      it('uses config fallback gas price when getBlockWithTransactions and getGasPrice provider calls fail', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].options.gasOracle;

        const getBlockWithTransactionsSpy = jest.spyOn(
          hre.ethers.providers.StaticJsonRpcProvider.prototype,
          'getBlockWithTransactions'
        );
        const getGasPriceSpy = jest.spyOn(hre.ethers.providers.StaticJsonRpcProvider.prototype, 'getGasPrice');
        getBlockWithTransactionsSpy.mockImplementation(async () => {
          throw new Error('some error');
        });
        getGasPriceSpy.mockImplementation(async () => {
          throw new Error('some error');
        });

        const gasPrice = await gasOracle.getOracleGasPrice(
          { ...provider, providerName },
          gasOracle.getChainProviderConfig(gasOracleConfig as GasOracleConfig)
        );
        const fallbackGasPrice = parsePriorityFee(gasOracleConfig.fallbackGasPrice as PriorityFee);

        expect(gasPrice).toEqual(fallbackGasPrice);
      });

      it('gets gas price for provider', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].options.gasOracle;

        const gasPrice = await gasOracle.getGasPrice(
          { ...provider, providerName },
          gasOracle.getChainProviderConfig(gasOracleConfig as GasOracleConfig)
        );

        const processedPercentileGasPrice = await processBlockData(
          blocksWithGasPrices,
          gasOracleConfig.latestGasPriceOptions.percentile,
          gasOracleConfig.latestGasPriceOptions.maxDeviationMultiplier,
          gasOracleConfig.fallbackGasPrice as PriorityFee
        );

        expect(gasPrice).toEqual(processedPercentileGasPrice);
      });

      it('uses provider fallback gas price if getOracleGasPrice throws', async () => {
        jest.spyOn(gasOracle, 'getOracleGasPrice').mockImplementation(() => {
          throw new Error('Gas oracle says no');
        });
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].options.gasOracle;

        const gasPrice = await gasOracle.getGasPrice(
          { ...provider, providerName },
          gasOracle.getChainProviderConfig(gasOracleConfig as GasOracleConfig)
        );

        const fallbackGasPrice = await provider.rpcProvider.getGasPrice();

        expect(gasPrice).toEqual(fallbackGasPrice);
      });

      it('uses config fallback gas price if both getOracleGasPrice and getFallbackGasPrice throw', async () => {
        jest.spyOn(gasOracle, 'getOracleGasPrice').mockImplementation(() => {
          throw new Error('Gas oracle says no');
        });
        jest.spyOn(gasOracle, 'getFallbackGasPrice').mockImplementation(() => {
          throw new Error('Gas oracle says no');
        });
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].options.gasOracle;

        const gasPrice = await gasOracle.getGasPrice(
          { ...provider, providerName },
          gasOracle.getChainProviderConfig(gasOracleConfig as GasOracleConfig)
        );

        const fallbackGasPrice = parsePriorityFee(gasOracleConfig.fallbackGasPrice as PriorityFee);

        expect(gasPrice).toEqual(fallbackGasPrice);
      });
    });
  });
});
