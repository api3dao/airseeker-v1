import { mockReadFileSync } from '../mock-utils';
import { ContractFactory, Contract, Wallet } from 'ethers';
import * as hre from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { deployAndUpdate } from '../setup/deployment';
import { main, handleStopSignal } from '../../src/main';
import { sleep } from '../../src/utils';
import * as makeRequest from '../../src/make-request';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(70_000);

const provider = new hre.ethers.providers.StaticJsonRpcProvider('http://127.0.0.1:8545');

const airseekerConfig = buildAirseekerConfig();
const secretsConfig = buildLocalSecrets();
process.env = Object.assign(process.env, secretsConfig);

describe('Airseeker', () => {
  let deployment: {
    accessControlRegistryFactory: ContractFactory;
    accessControlRegistry: Contract;
    api3ServerV1Factory: ContractFactory;
    api3ServerV1: Contract;
    templateIdETH: string;
    templateIdBTC: string;
    airnodeWallet: Wallet;
    beaconIdETH: string;
    beaconIdBTC: string;
    beaconIdLTC: string;
    beaconSetId: string;
  };

  beforeEach(async () => {
    // Reset the local hardhat network state for each test to prevent issues with other test contracts
    await hre.network.provider.send('hardhat_reset');
    // Set the net block timestamp to current time in seconds
    await hre.network.provider.send('evm_setNextBlockTimestamp', [Math.floor(Date.now() / 1000)]);
    // Mine the next block to set the timestamp for the following test
    await hre.network.provider.send('evm_mine');

    jest.restoreAllMocks();
    jest.clearAllTimers();

    deployment = await deployAndUpdate();
  });

  it('updates the beacons successfully', async () => {
    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const api3ServerV1 = deployment.api3ServerV1.connect(voidSigner);

    // Check that initial values are updated
    const beaconValueETH = await api3ServerV1.dataFeeds(deployment.beaconIdETH);
    const beaconValueBTC = await api3ServerV1.dataFeeds(deployment.beaconIdBTC);
    const beaconValueLTC = await api3ServerV1.dataFeeds(deployment.beaconIdLTC);
    const beaconSetValue = await api3ServerV1.dataFeeds(deployment.beaconSetId);

    expect(beaconValueETH.value).toEqual(hre.ethers.BigNumber.from(723.39202 * 1_000_000));
    expect(beaconValueBTC.value).toEqual(hre.ethers.BigNumber.from(41_091.12345 * 1_000_000));
    expect(beaconValueLTC.value).toEqual(hre.ethers.constants.Zero);
    expect(beaconSetValue.value).toEqual(hre.ethers.BigNumber.from(20_907.257735 * 1_000_000));

    mockReadFileSync('airseeker.json', JSON.stringify(airseekerConfig));

    const mainPromise = main();
    await sleep(30_000);
    handleStopSignal('SIGINT');
    await mainPromise;

    const beaconValueETHNew = await api3ServerV1.dataFeeds(deployment.beaconIdETH);
    const beaconValueBTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdBTC);
    const beaconValueLTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdLTC);
    const beaconSetValueNew = await api3ServerV1.dataFeeds(deployment.beaconSetId);

    expect(beaconValueETHNew.value).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew.value).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
    expect(beaconValueLTCNew.value).toEqual(hre.ethers.BigNumber.from(54.85 * 1_000_000));
    expect(beaconSetValueNew.value).toEqual(hre.ethers.BigNumber.from(21_900 * 1_000_000));
  });

  it('does not update if the condition check fails', async () => {
    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const api3ServerV1 = deployment.api3ServerV1.connect(voidSigner);

    // Check that initial values are updated
    const beaconValueETH = await api3ServerV1.dataFeeds(deployment.beaconIdETH);
    const beaconValueBTC = await api3ServerV1.dataFeeds(deployment.beaconIdBTC);
    const beaconValueLTC = await api3ServerV1.dataFeeds(deployment.beaconIdLTC);
    expect(beaconValueLTC.value).toEqual(hre.ethers.constants.Zero);
    const beaconSetValue = await api3ServerV1.dataFeeds(deployment.beaconSetId);

    mockReadFileSync(
      'airseeker.json',
      JSON.stringify({
        ...airseekerConfig,
        triggers: {
          dataFeedUpdates: {
            '31337': {
              '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
                beacons: [
                  {
                    beaconId: '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5',
                    deviationThreshold: 50,
                    heartbeatInterval: 86400,
                  },
                  {
                    beaconId: '0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990',
                    deviationThreshold: 50,
                    heartbeatInterval: 86400,
                  },
                  {
                    beaconId: '0x9b5825decf1232f79d3408fb6f7eeb7050fd88037f6517a94914e7d01ccd0cef',
                    deviationThreshold: 50,
                    heartbeatInterval: 86400,
                  },
                ],
                beaconSets: [
                  {
                    beaconSetId: '0xf7f1620b7f422eb9a69c8e21b317ba1555d3d87e1d804f0b024f03b107e411e8',
                    deviationThreshold: 50,
                    heartbeatInterval: 86400,
                  },
                ],
                updateInterval: 20,
              },
            },
          },
        },
      })
    );

    const mainPromise = main();
    await sleep(30_000);
    handleStopSignal('SIGINT');
    await mainPromise;

    const beaconValueETHNew = await api3ServerV1.dataFeeds(deployment.beaconIdETH);
    const beaconValueBTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdBTC);
    const beaconValueLTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdLTC);
    const beaconSetValueNew = await api3ServerV1.dataFeeds(deployment.beaconSetId);

    expect(beaconValueETHNew.value).toEqual(beaconValueETH.value);
    expect(beaconValueBTCNew.value).toEqual(beaconValueBTC.value);
    // Except LTC since it has not been initialized
    expect(beaconValueLTCNew.value).toEqual(hre.ethers.BigNumber.from(54.85 * 1_000_000));
    expect(beaconSetValueNew.value).toEqual(beaconSetValue.value);
  });

  it('updates if the Api3ServerV1 timestamp is older than heartbeatInterval', async () => {
    mockReadFileSync(
      'airseeker.json',
      JSON.stringify({
        ...airseekerConfig,
        triggers: {
          dataFeedUpdates: {
            '31337': {
              '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
                beacons: [
                  {
                    beaconId: '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5',
                    deviationThreshold: 50,
                    heartbeatInterval: 10,
                  },
                  {
                    beaconId: '0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990',
                    deviationThreshold: 50,
                    heartbeatInterval: 10,
                  },
                  {
                    beaconId: '0x9b5825decf1232f79d3408fb6f7eeb7050fd88037f6517a94914e7d01ccd0cef',
                    deviationThreshold: 50,
                    heartbeatInterval: 10,
                  },
                ],
                beaconSets: [
                  {
                    beaconSetId: '0xf7f1620b7f422eb9a69c8e21b317ba1555d3d87e1d804f0b024f03b107e411e8',
                    deviationThreshold: 50,
                    heartbeatInterval: 10,
                  },
                ],
                updateInterval: 20,
              },
            },
          },
        },
      })
    );

    const mainPromise = main();
    await sleep(30_000);
    handleStopSignal('SIGINT');
    await mainPromise;

    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const api3ServerV1 = deployment.api3ServerV1.connect(voidSigner);

    const beaconValueETHNew = await api3ServerV1.dataFeeds(deployment.beaconIdETH);
    const beaconValueBTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdBTC);
    const beaconValueLTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdLTC);
    const beaconSetValueNew = await api3ServerV1.dataFeeds(deployment.beaconSetId);

    expect(beaconValueETHNew.value).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew.value).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
    expect(beaconValueLTCNew.value).toEqual(hre.ethers.BigNumber.from(54.85 * 1_000_000));
    expect(beaconSetValueNew.value).toEqual(hre.ethers.BigNumber.from(21_900 * 1_000_000));
  });

  it('updates successfully after retrying a failed api call', async () => {
    mockReadFileSync('airseeker.json', JSON.stringify(airseekerConfig));

    const makeSignedDataGatewayRequestsSpy = jest.spyOn(makeRequest, 'makeSignedDataGatewayRequests');
    makeSignedDataGatewayRequestsSpy.mockRejectedValueOnce(new Error('Gateway call failed'));

    const makeApiRequestSpy = jest.spyOn(makeRequest, 'makeApiRequest');
    makeApiRequestSpy.mockRejectedValueOnce(new Error('Direct API call failed'));

    const mainPromise = main();
    await sleep(30_000);
    handleStopSignal('SIGINT');
    await mainPromise;

    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const api3ServerV1 = deployment.api3ServerV1.connect(voidSigner);

    const beaconValueETHNew = await api3ServerV1.dataFeeds(deployment.beaconIdETH);
    const beaconValueBTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdBTC);
    const beaconValueLTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdLTC);
    const beaconSetValueNew = await api3ServerV1.dataFeeds(deployment.beaconSetId);

    expect(beaconValueETHNew.value).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew.value).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
    expect(beaconValueLTCNew.value).toEqual(hre.ethers.BigNumber.from(54.85 * 1_000_000));
    expect(beaconSetValueNew.value).toEqual(hre.ethers.BigNumber.from(21_900 * 1_000_000));
  });

  it('updates successfully with one invalid provider present', async () => {
    mockReadFileSync(
      'airseeker.json',
      JSON.stringify({
        ...airseekerConfig,
        chains: {
          '31337': {
            contracts: {
              Api3ServerV1: '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512',
            },
            providers: {
              invalidProvider: {
                url: 'http://invalid',
              },
              local: {
                url: '${CP_LOCAL_URL}',
              },
            },
            options: {
              fulfillmentGasLimit: 500000,
              gasPriceOracle: [
                {
                  gasPriceStrategy: 'latestBlockPercentileGasPrice',
                  percentile: 60,
                  minTransactionCount: 29,
                  pastToCompareInBlocks: 20,
                  maxDeviationMultiplier: 5,
                },
                {
                  gasPriceStrategy: 'providerRecommendedGasPrice',
                  recommendedGasPriceMultiplier: 1.2,
                },
                {
                  gasPriceStrategy: 'constantGasPrice',
                  gasPrice: {
                    value: 10,
                    unit: 'gwei',
                  },
                },
              ],
            },
          },
        },
      })
    );

    const mainPromise = main();
    await sleep(30_000);
    handleStopSignal('SIGINT');
    await mainPromise;

    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const api3ServerV1 = deployment.api3ServerV1.connect(voidSigner);

    const beaconValueETHNew = await api3ServerV1.dataFeeds(deployment.beaconIdETH);
    const beaconValueBTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdBTC);
    const beaconValueLTCNew = await api3ServerV1.dataFeeds(deployment.beaconIdLTC);
    const beaconSetValueNew = await api3ServerV1.dataFeeds(deployment.beaconSetId);

    expect(beaconValueETHNew.value).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew.value).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
    expect(beaconValueLTCNew.value).toEqual(hre.ethers.BigNumber.from(54.85 * 1_000_000));
    expect(beaconSetValueNew.value).toEqual(hre.ethers.BigNumber.from(21_900 * 1_000_000));
  });

  it('throws on invalid airseeker config', async () => {
    mockReadFileSync(
      'airseeker.json',
      JSON.stringify({
        ...airseekerConfig,
        chains: '',
      })
    );
    await expect(main()).rejects.toThrow('Invalid Airseeker configuration file');
  });
});
