import { ethers } from 'ethers';
import * as hre from 'hardhat';
import { Api3ServerV1__factory as Api3ServerV1Factory } from '@api3/airnode-protocol-v1';
import { initiateDataFeedUpdates } from '../../src/update-data-feeds';
import * as utils from '../../src/utils';
import * as state from '../../src/state';
import { initializeProviders } from '../../src/providers';
import { deployAndUpdate } from '../setup/deployment';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { parseConfigWithSecrets } from '../../src/config';
import { initializeWallets } from '../../src/wallets';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const providerUrl = 'http://127.0.0.1:8545/';
const provider = new ethers.providers.StaticJsonRpcProvider(providerUrl);
const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, provider);
const api3ServerV1 = Api3ServerV1Factory.connect('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', provider);

describe('updateDataFeeds', () => {
  beforeEach(async () => {
    // Reset the local hardhat network state for each test to prevent issues with other test contracts
    await hre.network.provider.send('hardhat_reset');
    // Set the net block timestamp to current time in seconds
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Math.floor(Date.now() / 1000)]);
    // Mine the next block to set the timestamp for the following test
    await hre.network.provider.send('evm_mine');

    jest.restoreAllMocks();

    const { beaconIdETH, beaconIdLTC, signedDataETH, signedDataLTC } = await deployAndUpdate();
    const config = parseConfigWithSecrets(buildAirseekerConfig(), buildLocalSecrets());
    if (!config.success) {
      throw new Error('Invalid configuration fixture');
    }
    state.initializeState(config.data);
    initializeProviders();
    initializeWallets();
    const beaconValues = {
      [beaconIdETH]: signedDataETH,
      [beaconIdLTC]: signedDataLTC,
    };

    state.updateState((oldState) => ({ ...oldState, beaconValues }));
  });

  it('updates data feeds based on the configuration', async () => {
    initiateDataFeedUpdates();
    await utils.sleep(8_000);
    state.updateState((oldState) => ({ ...oldState, stopSignalReceived: true }));
    await utils.sleep(8_000);

    const beaconDataETH = await api3ServerV1
      .connect(voidSigner)
      .dataFeeds('0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5');
    expect(beaconDataETH.value.toString()).toEqual('738149047');
    const beaconDataBTC = await api3ServerV1
      .connect(voidSigner)
      .dataFeeds('0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990');
    expect(beaconDataBTC.value.toString()).toEqual('41091123450');
    const beaconDataLTC = await api3ServerV1
      .connect(voidSigner)
      .dataFeeds('0x9b5825decf1232f79d3408fb6f7eeb7050fd88037f6517a94914e7d01ccd0cef');
    expect(beaconDataLTC.value.toString()).toEqual('51420000');
    const beaconSetData = await api3ServerV1
      .connect(voidSigner)
      .dataFeeds('0xf7f1620b7f422eb9a69c8e21b317ba1555d3d87e1d804f0b024f03b107e411e8');
    expect(beaconSetData.value.toString()).toEqual('20914636248');
  });

  // TODO: Add more tests
});
