import { ethers } from 'ethers';
import * as hre from 'hardhat';
import { DapiServer__factory as DapiServerFactory } from '@api3/airnode-protocol-v1';
import { parsePriorityFee } from '@api3/airnode-utilities';
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
  beforeAll(async () => {
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
  });

  beforeEach(() => {
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

  describe('Gas Oracle', () => {
    it('updates beacons when the gas-oracle throws an error', async () => {
      jest.spyOn(gasOracle, 'getOracleGasPrice').mockImplementation(() => {
        throw new Error('Gas oracle says no');
      });
      const updateBeaconWithSignedDataSpy = jest.spyOn(dapiServer, 'updateBeaconWithSignedData');
      initiateBeaconUpdates();
      await utils.sleep(3_000);
      state.updateState((oldState) => ({ ...oldState, stopSignalReceived: true }));
      await utils.sleep(3_000);

      const beaconData = await dapiServer
        .connect(voidSigner)
        .readDataFeedValueWithId('0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5');
      expect(beaconData.toString()).toEqual('738149047');
      const fallbackGasPrice = await provider.getGasPrice();
      expect(updateBeaconWithSignedDataSpy).toHaveBeenCalledWith(
        expect.objectContaining({ gasPrice: fallbackGasPrice })
      );
    });

    it('updates beacons when the gas-oracle and fallback gas price throws an error', async () => {
      const { config } = state.getState();
      jest.spyOn(gasOracle, 'getOracleGasPrice').mockImplementation(() => {
        throw new Error('Gas oracle says no');
      });
      jest.spyOn(gasOracle, 'getFallbackGasPrice').mockImplementation(() => {
        throw new Error('Gas oracle says no');
      });
      const updateBeaconWithSignedDataSpy = jest.spyOn(dapiServer, 'updateBeaconWithSignedData');
      initiateBeaconUpdates();
      await utils.sleep(3_000);
      state.updateState((oldState) => ({ ...oldState, stopSignalReceived: true }));
      await utils.sleep(3_000);

      const beaconData = await dapiServer
        .connect(voidSigner)
        .readDataFeedValueWithId('0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5');
      expect(beaconData.toString()).toEqual('738149047');
      expect(updateBeaconWithSignedDataSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          gasPrice: parsePriorityFee(config.chains['31137'].options.gasOracle.fallbackGasPrice),
        })
      );
    });
  });
  // TODO: Add more tests
});
