import { mockReadFileSync } from '../mock-utils';
import { ContractFactory, Contract, Wallet } from 'ethers';
import * as hre from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { deployAndUpdateSubscriptions } from '../setup/deployment';
import { main, handleStopSignal } from '../../src/main';
import { sleep } from '../../src/utils';
import * as makeRequest from '../../src/make-request';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const provider = new hre.ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');

const airseekerConfig = buildAirseekerConfig();
const secretsConfig = buildLocalSecrets();
process.env = Object.assign(process.env, secretsConfig);

const readBeaconValue = async (airnodeAddress: string, templateId: string, dapiServer: Contract) => {
  const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
  const beaconId = hre.ethers.utils.keccak256(
    hre.ethers.utils.solidityPack(['address', 'bytes32'], [airnodeAddress, templateId])
  );

  try {
    return await dapiServer.connect(voidSigner).readDataFeedValueWithId(beaconId);
  } catch (e) {
    return null;
  }
};

describe('Airseeker', () => {
  let deployment: {
    accessControlRegistryFactory: ContractFactory;
    accessControlRegistry: Contract;
    airnodeProtocolFactory: ContractFactory;
    airnodeProtocol: Contract;
    dapiServerFactory: ContractFactory;
    dapiServer: Contract;
    templateIdETH: string;
    templateIdBTC: string;
    airnodePspSponsorWallet: Wallet;
    airnodeWallet: Wallet;
    subscriptionIdETH: string;
    subscriptionIdBTC: string;
  };

  beforeEach(async () => {
    // Reset the local hardhat network state for each test to prevent issues with other test contracts
    await hre.network.provider.send('hardhat_reset');
    jest.restoreAllMocks();
    jest.clearAllTimers();

    deployment = await deployAndUpdateSubscriptions();
  });

  it('updates the beacons successfully', async () => {
    mockReadFileSync('airseeker.json', JSON.stringify(airseekerConfig));

    // Check that initial values are updated
    const beaconValueETH = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );
    const beaconValueBTC = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdBTC,
      deployment.dapiServer
    );

    expect(beaconValueETH).toEqual(hre.ethers.BigNumber.from(723.39202 * 1_000_000));
    expect(beaconValueBTC).toEqual(hre.ethers.BigNumber.from(41_091.12345 * 1_000_000));

    await main().then(async () => {
      // Wait for Airseeker cycles to finish
      await sleep(8_000);
      // Stop Airseeker
      handleStopSignal('stop');
      // Wait for last cycle to finish
      await sleep(8_000);
    });

    const beaconValueETHNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );
    const beaconValueBTCNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdBTC,
      deployment.dapiServer
    );

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
  });

  it('does not update if the condition check fails', async () => {
    mockReadFileSync(
      'airseeker.json',
      JSON.stringify({
        ...airseekerConfig,
        triggers: {
          beaconUpdates: {
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
                ],
                updateInterval: 6,
              },
            },
          },
          beaconSetUpdates: {},
        },
      })
    );

    // Check that initial values are updated
    const beaconValueETH = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );
    const beaconValueBTC = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdBTC,
      deployment.dapiServer
    );

    await main().then(async () => {
      // Wait for Airseeker cycles to finish
      await sleep(8_000);
      // Stop Airseeker
      handleStopSignal('stop');
      // Wait for last cycle to finish
      await sleep(8_000);
    });

    const beaconValueETHNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );
    const beaconValueBTCNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdBTC,
      deployment.dapiServer
    );

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(beaconValueETH));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(beaconValueBTC));
  });

  it('updates if the dapiserver timestamp is older than hearbeatinterval', async () => {
    mockReadFileSync(
      'airseeker.json',
      JSON.stringify({
        ...airseekerConfig,
        triggers: {
          beaconUpdates: {
            '31337': {
              '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
                beacons: [
                  {
                    beaconId: '0x924b5d4cb3ec6366ae4302a1ca6aec035594ea3ea48a102d160b50b0c43ebfb5',
                    deviationThreshold: 50,
                    heartbeatInterval: 1,
                  },
                  {
                    beaconId: '0xbf7ce55d109fd196de2a8bf1515d166c56c9decbe9cb473656bbca30d5743990',
                    deviationThreshold: 50,
                    heartbeatInterval: 1,
                  },
                ],
                updateInterval: 6,
              },
            },
          },
          beaconSetUpdates: {},
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

    const beaconValueETHNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );
    const beaconValueBTCNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdBTC,
      deployment.dapiServer
    );

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
  });

  it('updates the beacons successfully after retrying a failed api call', async () => {
    mockReadFileSync('airseeker.json', JSON.stringify(airseekerConfig));

    const makeRequestSpy = jest.spyOn(makeRequest, 'makeSignedDataGatewayRequests');
    makeRequestSpy.mockRejectedValueOnce(new Error('Api call failed'));

    await main().then(async () => {
      // Wait for Airseeker cycles to finish
      await sleep(8_000);
      // Stop Airseeker
      handleStopSignal('stop');
      // Wait for last cycle to finish
      await sleep(8_000);
    });

    const beaconValueETHNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );
    const beaconValueBTCNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdBTC,
      deployment.dapiServer
    );

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
  });

  it('updates the beacons successfully with one invalid provider present', async () => {
    mockReadFileSync(
      'airseeker.json',
      JSON.stringify({
        ...airseekerConfig,
        chains: {
          '31337': {
            contracts: {
              DapiServer: '0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0',
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
              txType: 'eip1559',
              priorityFee: {
                value: 3.12,
                unit: 'gwei',
              },
              baseFeeMultiplier: 2,
              fulfillmentGasLimit: 500_000,
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

    const beaconValueETHNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );
    const beaconValueBTCNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdBTC,
      deployment.dapiServer
    );

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
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
