import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { checkUpdateCondition } from '../src/check-condition';

const dapiServerAbi = JSON.parse(fs.readFileSync(path.resolve('./src/test/artifacts/DapiServer.json')).toString());

describe('checkUpdateCondition', () => {
  const providerUrl = 'http://127.0.0.1:8545/';
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);
  const dapiServer = new ethers.Contract('0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0', dapiServerAbi.abi, provider);

  const apiValue = 723.39202;
  const _times = 1_000_000;
  const deviationThreshold = 0.2;

  it('returns true for increase above the deviationThreshold', async () => {
    const beaconId = await dapiServer.subscriptionIdToBeaconId(
      '0xc1ed31de05a9aa74410c24bccd6aa40235006f9063f1c65d47401e97ad04560e'
    );
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
    const beaconId = await dapiServer.subscriptionIdToBeaconId(
      '0xc1ed31de05a9aa74410c24bccd6aa40235006f9063f1c65d47401e97ad04560e'
    );
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
    const beaconId = await dapiServer.subscriptionIdToBeaconId(
      '0xc1ed31de05a9aa74410c24bccd6aa40235006f9063f1c65d47401e97ad04560e'
    );
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
    const beaconId = await dapiServer.subscriptionIdToBeaconId(
      '0xc1ed31de05a9aa74410c24bccd6aa40235006f9063f1c65d47401e97ad04560e'
    );
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
    const beaconId = await dapiServer.subscriptionIdToBeaconId(
      '0xc1ed31de05a9aa74410c24bccd6aa40235006f9063f1c65d47401e97ad04560e'
    );
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
