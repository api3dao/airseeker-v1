import { ethers } from 'ethers';
import * as hre from 'hardhat';
import { DapiServer__factory as DapiServerFactory } from '@api3/airnode-protocol-v1';
import { assertGoSuccess } from '@api3/promise-utils';
import { checkUpdateCondition, OnChainBeaconData } from '../../src/check-condition';
import { deployAndUpdateSubscriptions } from '../setup/deployment';
import { readOnChainBeaconData } from '../../src/update-beacons';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const providerUrl = 'http://127.0.0.1:8545/';
const provider = new ethers.providers.JsonRpcProvider(providerUrl);
const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, provider);
const dapiServer = DapiServerFactory.connect('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0', provider);

const apiValue = 723.39202;
const _times = 1_000_000;
const deviationThreshold = 0.2;

let onChainValue: OnChainBeaconData;

describe('checkUpdateCondition', () => {
  let beaconId: string;
  beforeAll(async () => {
    // Reset the local hardhat network state for each test to prevent issues with other test contracts
    await hre.network.provider.send('hardhat_reset');
    jest.restoreAllMocks();

    const { airnodeWallet, templateIdETH } = await deployAndUpdateSubscriptions();
    beaconId = ethers.utils.keccak256(
      ethers.utils.solidityPack(['address', 'bytes32'], [airnodeWallet.address, templateIdETH])
    );

    const goReadChain = await readOnChainBeaconData(voidSigner, dapiServer, beaconId, {});
    assertGoSuccess(goReadChain);
    onChainValue = goReadChain.data;
  });

  it('returns true for increase above the deviationThreshold', async () => {
    const checkResult = await checkUpdateCondition(
      onChainValue,
      deviationThreshold,
      ethers.BigNumber.from(Math.floor(apiValue * (1 + 0.3 / 100) * _times))
    );

    expect(checkResult).toEqual(true);
  });

  it('returns false for increase below the deviationThreshold', async () => {
    const checkResult = await checkUpdateCondition(
      onChainValue,
      deviationThreshold,
      ethers.BigNumber.from(Math.floor(apiValue * (1 + 0.1 / 100) * _times))
    );

    expect(checkResult).toEqual(false);
  });

  it('returns true for decrease above the deviationThreshold', async () => {
    const checkResult = await checkUpdateCondition(
      onChainValue,
      deviationThreshold,
      ethers.BigNumber.from(Math.floor(apiValue * (1 - 0.3 / 100) * _times))
    );

    expect(checkResult).toEqual(true);
  });

  it('returns false for decrease below the deviationThreshold', async () => {
    const checkResult = await checkUpdateCondition(
      onChainValue,
      deviationThreshold,
      ethers.BigNumber.from(Math.floor(apiValue * (1 - 0.1 / 100) * _times))
    );

    expect(checkResult).toEqual(false);
  });

  it('returns false for no change', async () => {
    const checkResult = await checkUpdateCondition(
      onChainValue,
      deviationThreshold,
      ethers.BigNumber.from(apiValue * _times)
    );

    expect(checkResult).toEqual(false);
  });
});
