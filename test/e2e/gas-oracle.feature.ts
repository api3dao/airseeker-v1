import { mockReadFileSync } from '../mock-utils';
import * as hre from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import { main, handleStopSignal } from '../../src/main';
import * as gasOracle from '../../src/gas-oracle';
import * as state from '../../src/state';
import { sleep } from '../../src/utils';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { executeTransactions } from '../setup/transactions';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const chainId = '31337';
const providerName = 'local';
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

      it('starts gas oracle', async () => {
        mockReadFileSync('airseeker.json', JSON.stringify(airseekerConfig));

        await main().then(async () => {
          // Wait for Airseeker cycles to finish
          await sleep(8_000);
          // Stop Airseeker
          handleStopSignal('stop');
          // Wait for last cycle to finish
          await sleep(8_000);
        });

        const { gasOracles } = state.getState();
        const stateChainProviderGasOracle = gasOracles[chainId][providerName];

        const processedBlockData = processBlockData(blocksWithGasPrices);

        expect(stateChainProviderGasOracle.blockData.length).toEqual(gasOracleConfig.sampleBlockCount);
        expect(stateChainProviderGasOracle.percentileGasPrice).toEqual(
          gasOracle.getPercentile(gasOracleConfig.percentile, processedBlockData)
        );
      });
    });
  });

  txTypes.forEach((_txType) => {
    it('does not run gas oracle for invalid chains', async () => {
      const invalidChainId = '123456789';
      mockReadFileSync(
        'airseeker.json',
        JSON.stringify({
          ...airseekerConfig,
          chains: {
            ...airseekerConfig.chains,
            [invalidChainId]: {
              contracts: {
                DapiServer: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
              },
              providers: {
                invalidProvider: {
                  url: '${CP_LOCAL_URL}',
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
                sampleBlockCount: 20,
                percentile: 60,
                updateInterval: 20,
              },
            },
          },
        })
      );

      await main().then(async () => {
        // Wait for Airseeker cycles to finish
        await sleep(8_000);
        // Stop Airseeker
        handleStopSignal('stop');
        // Wait for last cycle to finish
        await sleep(8_000);
      });

      const { gasOracles } = state.getState();
      const stateChainProviderGasOracle = gasOracles[invalidChainId];

      expect(stateChainProviderGasOracle).toBeUndefined();
    });
  });
});
