import * as hre from 'hardhat';
import { BigNumber } from 'ethers';
import '@nomiclabs/hardhat-ethers';
import * as gasOracle from '../../src/gas-oracle';
import * as state from '../../src/state';
import * as providersApi from '../../src/providers';
import * as checkConditions from '../../src/check-condition';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { executeTransactions } from '../setup/transactions';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const chainId = '31337';
const providerName = 'local';
const providerUrl = 'http://127.0.0.1:8545/';
const provider = new hre.ethers.providers.StaticJsonRpcProvider(providerUrl);
const airseekerConfig = buildAirseekerConfig();
const secretsConfig = buildLocalSecrets();
const gasOracleConfig = airseekerConfig.chains[chainId].gasOracle;
process.env = Object.assign(process.env, secretsConfig);

const processBlockData = async (
  blocksWithGasPrices: { blockNumber: number; gasPrices: BigNumber[] }[],
  percentile: number,
  gasPriceDeviationThreshold: number,
  backupGasPriceGwei: number
) => {
  const latestBlock = blocksWithGasPrices[0];
  const referenceBlock = blocksWithGasPrices[20];

  const latestBlockPercentileGasPrice = gasOracle.getPercentile(
    gasOracleConfig.percentile,
    latestBlock.gasPrices.map((p) => p)
  );
  const referenceBlockPercentileGasPrice = gasOracle.getPercentile(
    percentile,
    referenceBlock.gasPrices.map((p) => p)
  );

  const exceedsGasPriceDeviationThreshold = checkConditions.checkUpdateCondition(
    referenceBlockPercentileGasPrice!,
    gasPriceDeviationThreshold,
    latestBlockPercentileGasPrice!
  );

  if (!exceedsGasPriceDeviationThreshold) return latestBlockPercentileGasPrice;

  try {
    return await provider.getGasPrice();
  } catch (_e) {
    return hre.ethers.utils.parseUnits(backupGasPriceGwei.toString(), 'gwei');
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
        // Disable automining to get multiple transaction per block
        await hre.network.provider.send('evm_setAutomine', [false]);
        jest.restoreAllMocks();

        const transactions = await executeTransactions(txType);

        blocksWithGasPrices = transactions.blocksWithGasPrices.sort((a, b) => b.blockNumber - a.blockNumber);

        // Set automining to true
        await hre.network.provider.send('evm_setAutomine', [true]);
      });

      it('gets gas price for provider', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].gasOracle;

        const gasPrice = await gasOracle.getOracleGasPrice({ ...provider, providerName }, gasOracleConfig);

        const processedPercentileGasPrice = await processBlockData(
          blocksWithGasPrices,
          gasOracleConfig.percentile,
          gasOracleConfig.gasPriceDeviationThreshold,
          gasOracleConfig.backupGasPriceGwei
        );

        expect(gasPrice).toEqual(processedPercentileGasPrice);
      });

      it('uses fallback getGasPrice when gasPriceDeviationThreshold is exceeded', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = {
          ...airseekerConfig.chains[chainId].gasOracle,
          // Set a low gasPriceDeviationThreshold to test getGasPrice fallback
          gasPriceDeviationThreshold: 1,
        };

        const gasPrice = await gasOracle.getOracleGasPrice({ ...provider, providerName }, gasOracleConfig);
        const fallbackGasPrice = await provider.rpcProvider.getGasPrice();

        expect(gasPrice).toEqual(fallbackGasPrice);
      });

      it('uses fallback getGasPrice when getBlockWithTransactions provider calls fail', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].gasOracle;

        const getBlockWithTransactionsSpy = jest.spyOn(
          hre.ethers.providers.StaticJsonRpcProvider.prototype,
          'getBlockWithTransactions'
        );
        getBlockWithTransactionsSpy.mockImplementation(async () => {
          throw new Error('some error');
        });

        const gasPrice = await gasOracle.getOracleGasPrice({ ...provider, providerName }, gasOracleConfig);
        const fallbackGasPrice = await provider.rpcProvider.getGasPrice();

        expect(gasPrice).toEqual(fallbackGasPrice);
      });

      it('uses fallback backupGasPriceGwei when getBlockWithTransactions and getGasPrice provider calls fail', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].gasOracle;

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

        const gasPrice = await gasOracle.getOracleGasPrice({ ...provider, providerName }, gasOracleConfig);
        const fallbackGasPrice = hre.ethers.utils.parseUnits(gasOracleConfig.backupGasPriceGwei.toString(), 'gwei');

        expect(gasPrice).toEqual(fallbackGasPrice);
      });
    });
  });
});
