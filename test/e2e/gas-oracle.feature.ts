import * as hre from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import * as gasOracle from '../../src/gas-oracle';
import * as state from '../../src/state';
import * as providersApi from '../../src/providers';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { executeTransactions } from '../setup/transactions';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const chainId = '31337';
const providerName = 'local';
const providerUrl = 'http://127.0.0.1:8545/';
const airseekerConfig = buildAirseekerConfig();
const secretsConfig = buildLocalSecrets();
const gasOracleConfig = airseekerConfig.chains[chainId].gasOracle;
process.env = Object.assign(process.env, secretsConfig);

const processBlockData = (blocksWithGasPrices: gasOracle.BlockData[]) => {
  const sortedBlocksWithGasPrices = blocksWithGasPrices.sort((a, b) => (b.blockNumber > a.blockNumber ? 1 : -1));
  if (sortedBlocksWithGasPrices.length > gasOracleConfig.sampleBlockCount) {
    sortedBlocksWithGasPrices.splice(gasOracleConfig.sampleBlockCount);
  }
  return sortedBlocksWithGasPrices.flatMap((b) => b.gasPrices);
};

describe('Gas oracle', () => {
  const txTypes: ('eip1559' | 'legacy')[] = ['eip1559', 'legacy'];

  txTypes.forEach((txType) => {
    describe(`${txType} network`, () => {
      let blocksWithGasPrices: gasOracle.BlockData[];

      beforeAll(async () => {
        // Reset the local hardhat network state for each test to prevent issues with other test contracts
        await hre.network.provider.send('hardhat_reset');
        // Disable automining to get multiple transaction per block
        await hre.network.provider.send('evm_setAutomine', [false]);
        jest.restoreAllMocks();

        const transactions = await executeTransactions(txType);

        blocksWithGasPrices = transactions.blocksWithGasPrices;

        // Set automining to true
        await hre.network.provider.send('evm_setAutomine', [true]);
      });

      it('gets gas price for provider', async () => {
        state.initializeState(airseekerConfig as any);
        const provider = providersApi.initializeProvider(chainId, providerUrl);
        const gasOracleConfig = airseekerConfig.chains[chainId].gasOracle;

        const gasPrice = await gasOracle.getGasPrice({ ...provider, providerName }, gasOracleConfig);

        const { gasOracles } = state.getState();
        const stateChainProviderGasOracle = gasOracles[chainId][providerName];
        const processedBlockData = processBlockData(blocksWithGasPrices);

        expect(stateChainProviderGasOracle.blockData.length).toEqual(gasOracleConfig.sampleBlockCount);
        expect(gasPrice).toEqual(gasOracle.getPercentile(gasOracleConfig.percentile, processedBlockData));
        expect(stateChainProviderGasOracle.percentileGasPrice).toEqual(
          gasOracle.getPercentile(gasOracleConfig.percentile, processedBlockData)
        );
      });
    });
  });
});
