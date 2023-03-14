import { ethers } from 'ethers';
import * as hre from 'hardhat';
import { Api3ServerV1__factory as Api3ServerV1Factory } from '@api3/airnode-protocol-v1';
import { checkUpdateCondition } from '../../src/check-condition';
import { deployAndUpdate } from '../setup/deployment';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const providerUrl = 'http://127.0.0.1:8545/';
const provider = new ethers.providers.StaticJsonRpcProvider(providerUrl);
const voidSigner = new ethers.VoidSigner(ethers.constants.AddressZero, provider);
const api3ServerV1 = Api3ServerV1Factory.connect('0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', provider);

const apiValue = 723.39202;
const _times = 1_000_000;
const deviationThreshold = 0.2;

let onChainValue: {
  value: ethers.BigNumber;
  timestamp: number;
};

describe('checkUpdateCondition', () => {
  let beaconId: string;
  beforeAll(async () => {
    // Reset the local hardhat network state for each test to prevent issues with other test contracts
    await hre.network.provider.send('hardhat_reset');
    // Set the net block timestamp to current time in seconds
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Math.floor(Date.now() / 1000)]);
    // Mine the next block to set the timestamp for the following test
    await hre.network.provider.send('evm_mine');

    jest.restoreAllMocks();

    const { airnodeWallet, templateIdETH } = await deployAndUpdate();
    beaconId = ethers.utils.keccak256(
      ethers.utils.solidityPack(['address', 'bytes32'], [airnodeWallet.address, templateIdETH])
    );

    onChainValue = (await api3ServerV1.connect(voidSigner).dataFeeds(beaconId))!;
  });

  it('returns true for increase above the deviationThreshold', () => {
    const checkResult = checkUpdateCondition(
      onChainValue.value,
      deviationThreshold,
      ethers.BigNumber.from(Math.floor(apiValue * (1 + 0.3 / 100) * _times))
    );

    expect(checkResult).toEqual(true);
  });

  it('returns false for increase below the deviationThreshold', () => {
    const checkResult = checkUpdateCondition(
      onChainValue.value,
      deviationThreshold,
      ethers.BigNumber.from(Math.floor(apiValue * (1 + 0.1 / 100) * _times))
    );

    expect(checkResult).toEqual(false);
  });

  it('returns true for decrease above the deviationThreshold', () => {
    const checkResult = checkUpdateCondition(
      onChainValue.value,
      deviationThreshold,
      ethers.BigNumber.from(Math.floor(apiValue * (1 - 0.3 / 100) * _times))
    );

    expect(checkResult).toEqual(true);
  });

  it('returns false for decrease below the deviationThreshold', () => {
    const checkResult = checkUpdateCondition(
      onChainValue.value,
      deviationThreshold,
      ethers.BigNumber.from(Math.floor(apiValue * (1 - 0.1 / 100) * _times))
    );

    expect(checkResult).toEqual(false);
  });

  it('returns false for no change', () => {
    const checkResult = checkUpdateCondition(
      onChainValue.value,
      deviationThreshold,
      ethers.BigNumber.from(apiValue * _times)
    );

    expect(checkResult).toEqual(false);
  });
});
