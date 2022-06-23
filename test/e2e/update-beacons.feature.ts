import { ethers } from 'ethers';
import * as hre from 'hardhat';
import { DapiServer__factory as DapiServerFactory } from '@api3/airnode-protocol-v1';
import { parsePriorityFee } from '@api3/airnode-utilities';
import * as promiseUtils from '@api3/promise-utils';
import { initiateBeaconUpdates } from '../../src/update-beacons';
import * as utils from '../../src/utils';
import * as state from '../../src/state';
import * as gasOracle from '../../src/gas-oracle';
import { initializeProviders } from '../../src/providers';
import { deployAndUpdateSubscriptions } from '../setup/deployment';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { SignedData } from '../../src/validation';
import { parseConfigWithSecrets } from '../../src/config';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const providerUrl = 'http://127.0.0.1:8545/';
const provider = new ethers.providers.JsonRpcProvider(providerUrl);
const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, provider);
const dapiServer = DapiServerFactory.connect('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0', provider);
let signedData: SignedData;

describe('updateBeacons', () => {
  beforeEach(async () => {
    // Reset the local hardhat network state for each test to prevent issues with other test contracts
    await hre.network.provider.send('hardhat_reset');
    jest.restoreAllMocks();

    const { signedData: preparedSignedData } = await deployAndUpdateSubscriptions();
    signedData = preparedSignedData;
    const config = parseConfigWithSecrets(buildAirseekerConfig(), buildLocalSecrets());
    if (!config.success) {
      throw new Error('Invalid configuration fixture');
    }
    state.initializeState(config.data);
    initializeProviders();

    const beaconValues1 = {
      '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5': signedData,
    };

    state.updateState((oldState) => ({ ...oldState, beaconValues: beaconValues1 }));
  });

  it('updates beacons based on the configuration', async () => {
    initiateBeaconUpdates();
    await utils.sleep(3_000);
    state.updateState((oldState) => ({ ...oldState, stopSignalReceived: true }));
    await utils.sleep(3_000);

    const beaconData = await dapiServer
      .connect(voidSigner)
      .readDataFeedValueWithId('0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5');
    expect(beaconData.toString()).toEqual('738149047');
  });

  describe('Gas oracle failures', () => {
    it('updates beacons when the gas-oracle throws an error', async () => {
      jest.spyOn(gasOracle, 'getOracleGasPrice').mockImplementation(() => {
        throw new Error('Gas oracle says no');
      });
      const goSpy = jest.spyOn(promiseUtils, 'go');
      const getFallbackGasPriceSpy = jest.spyOn(gasOracle, 'getFallbackGasPrice');
      initiateBeaconUpdates();
      await utils.sleep(3_000);
      state.updateState((oldState) => ({ ...oldState, stopSignalReceived: true }));
      await utils.sleep(3_000);

      const goResolvedPromises = await Promise.all(goSpy.mock.results.map((r) => r.value));
      const getFallbackGasPriceResolvedPromises = await Promise.all(
        getFallbackGasPriceSpy.mock.results.map((r) => r.value)
      );
      const updateTx = goResolvedPromises[goResolvedPromises.length - 1];
      const lastProviderReportedGasPrice =
        getFallbackGasPriceResolvedPromises[getFallbackGasPriceResolvedPromises.length - 1];
      const gasPrice = updateTx.data.gasPrice;

      const beaconData = await dapiServer
        .connect(voidSigner)
        .readDataFeedValueWithId('0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5');
      expect(beaconData.toString()).toEqual('738149047');
      // Check that the used gas price was the fallback from provider
      expect(gasPrice).toEqual(lastProviderReportedGasPrice);
    });

    it('updates beacons when the gas-oracle and fallback gas price throws an error', async () => {
      const { config } = state.getState();
      jest.spyOn(gasOracle, 'getOracleGasPrice').mockImplementation(() => {
        throw new Error('Gas oracle says no');
      });
      jest.spyOn(gasOracle, 'getFallbackGasPrice').mockImplementation(() => {
        throw new Error('Gas oracle says no');
      });
      const goSpy = jest.spyOn(promiseUtils, 'go');
      initiateBeaconUpdates();
      await utils.sleep(3_000);
      state.updateState((oldState) => ({ ...oldState, stopSignalReceived: true }));
      await utils.sleep(3_000);

      const goResolvedPromises = await Promise.all(goSpy.mock.results.map((r) => r.value));
      const updateTx = goResolvedPromises[goResolvedPromises.length - 1];
      const gasPrice = updateTx.data.gasPrice;

      const beaconData = await dapiServer
        .connect(voidSigner)
        .readDataFeedValueWithId('0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5');
      expect(beaconData.toString()).toEqual('738149047');
      // Check that the used gas price was the fallback from config
      expect(gasPrice).toEqual(parsePriorityFee(config.chains['31337'].options.gasOracle.fallbackGasPrice));
    });
  });

  // TODO: Add more tests
});
