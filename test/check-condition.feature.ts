import { ethers } from 'ethers';
import { DapiServer__factory as DapiServerFactory } from '@api3/airnode-protocol-v1';
import { checkUpdateCondition } from '../src/check-condition';

describe('checkUpdateCondition', () => {
  const providerUrl = 'http://127.0.0.1:8545/';
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const dapiServer = new ethers.Contract('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0', DapiServerFactory.abi, provider);
  const beaconId = ethers.utils.keccak256(
    ethers.utils.solidityPack(
      ['address', 'bytes32'],
      [
        '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
        '0xea30f92923ece1a97af69d450a8418db31be5a26a886540a13c09c739ba8eaaa',
      ]
    )
  );

  const apiValue = 723.39202;
  const _times = 1_000_000;
  const deviationThreshold = 0.2;

  it('returns true for increase above the deviationThreshold', async () => {
    const checkResult = await checkUpdateCondition(
      providerUrl,
      dapiServer,
      beaconId,
      deviationThreshold,
      Math.floor(apiValue * (1 + 0.3 / 100) * _times)
    );

    expect(checkResult).toEqual(true);
  });

  it('returns false for increase below the deviationThreshold', async () => {
    const checkResult = await checkUpdateCondition(
      providerUrl,
      dapiServer,
      beaconId,
      deviationThreshold,
      Math.floor(apiValue * (1 + 0.1 / 100) * _times)
    );

    expect(checkResult).toEqual(false);
  });

  it('returns true for decrease above the deviationThreshold', async () => {
    const checkResult = await checkUpdateCondition(
      providerUrl,
      dapiServer,
      beaconId,
      deviationThreshold,
      Math.floor(apiValue * (1 - 0.3 / 100) * _times)
    );

    expect(checkResult).toEqual(true);
  });

  it('returns false for decrease below the deviationThreshold', async () => {
    const checkResult = await checkUpdateCondition(
      providerUrl,
      dapiServer,
      beaconId,
      deviationThreshold,
      Math.floor(apiValue * (1 - 0.1 / 100) * _times)
    );

    expect(checkResult).toEqual(false);
  });

  it('returns false for no change', async () => {
    const checkResult = await checkUpdateCondition(
      providerUrl,
      dapiServer,
      beaconId,
      deviationThreshold,
      apiValue * _times
    );

    expect(checkResult).toEqual(false);
  });
});
