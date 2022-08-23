import * as os from 'os';
import * as path from 'path';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { ContractFactory, Contract, Wallet } from 'ethers';
import * as hre from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import pm2 from 'pm2';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { deployAndUpdateSubscriptions } from '../setup/deployment';
import { sleep } from '../../src/utils';
import { Config } from '../../src/validation';
import { logger } from '../../src/logging';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const provider = new hre.ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');

const airseekerConfig = buildAirseekerConfig();
const secretsConfig = buildLocalSecrets();
process.env = Object.assign(process.env, secretsConfig);

const createTmpConfig = (content: Config) => {
  const tmpFilename = path.join(os.tmpdir(), `airseeker.tmp.config.${crypto.randomBytes(6).toString('hex')}.json`);
  fs.writeFileSync(tmpFilename, JSON.stringify(content));
  return tmpFilename;
};

const AIRSEEKER_E2E_PROCESS = 'airseeker-e2e';

const startAirseeker = (configFilename: string) => {
  pm2.connect((err) => {
    if (err) throw err;

    pm2.start(
      {
        script: `ts-node test/setup/wrapper.ts ${configFilename}`,
        name: AIRSEEKER_E2E_PROCESS,
        autorestart: false,
        max_restarts: 0,
      },
      (err) => {
        if (err) {
          logger.error(err.message);
        }
        pm2.disconnect();
      }
    );
  });
};

const stopAirseeker = () => {
  pm2.connect((err) => {
    if (err) throw err;

    pm2.list((err, list) => {
      if (err) {
        logger.error(err.message);
        return pm2.disconnect();
      }

      const airseekerProcess = list.find((process) => process.name === AIRSEEKER_E2E_PROCESS);
      if (airseekerProcess) {
        pm2.delete(AIRSEEKER_E2E_PROCESS, (err) => {
          if (err) {
            logger.error(err.message);
          }
          pm2.disconnect();
        });
      }
    });
  });
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
    beaconIdETH: string;
    beaconIdBTC: string;
    beaconSetId: string;
  };

  let tmpConfigFilename: string;

  beforeEach(async () => {
    // Reset the local hardhat network state for each test to prevent issues with other test contracts
    await hre.network.provider.send('hardhat_reset');
    jest.restoreAllMocks();
    jest.clearAllTimers();

    deployment = await deployAndUpdateSubscriptions();
  });

  afterEach(async () => {
    if (fs.existsSync(tmpConfigFilename)) {
      fs.rmSync(tmpConfigFilename);
    }

    stopAirseeker();
    await sleep(3_000);
  });

  it('updates the beacons successfully', async () => {
    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const dapiServer = deployment.dapiServer.connect(voidSigner);

    // Check that initial values are updated
    const beaconValueETH = await dapiServer.readDataFeedValueWithId(deployment.beaconIdETH);
    const beaconValueBTC = await dapiServer.readDataFeedValueWithId(deployment.beaconIdBTC);
    const beaconSetValue = await dapiServer.readDataFeedValueWithId(deployment.beaconSetId);

    expect(beaconValueETH).toEqual(hre.ethers.BigNumber.from(723.39202 * 1_000_000));
    expect(beaconValueBTC).toEqual(hre.ethers.BigNumber.from(41_091.12345 * 1_000_000));
    expect(beaconSetValue).toEqual(hre.ethers.BigNumber.from(20_907.257735 * 1_000_000));

    tmpConfigFilename = createTmpConfig(airseekerConfig as Config);
    startAirseeker(tmpConfigFilename);
    await sleep(25_000);

    const beaconValueETHNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdETH);
    const beaconValueBTCNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdBTC);
    const beaconSetValueNew = await dapiServer.readDataFeedValueWithId(deployment.beaconSetId);

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
    expect(beaconSetValueNew).toEqual(hre.ethers.BigNumber.from(21_900 * 1_000_000));
  });

  it('does not update if the condition check fails', async () => {
    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const dapiServer = deployment.dapiServer.connect(voidSigner);

    // Check that initial values are updated
    const beaconValueETH = await dapiServer.readDataFeedValueWithId(deployment.beaconIdETH);
    const beaconValueBTC = await dapiServer.readDataFeedValueWithId(deployment.beaconIdBTC);
    const beaconSetValue = await dapiServer.readDataFeedValueWithId(deployment.beaconSetId);

    tmpConfigFilename = createTmpConfig({
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
              ],
              beaconSets: [
                {
                  beaconSetId: '0xf7f1620b7f422eb9a69c8e21b317ba1555d3d87e1d804f0b024f03b107e411e8',
                  deviationThreshold: 50,
                  heartbeatInterval: 86400,
                },
              ],
              updateInterval: 10,
            },
          },
        },
      },
    } as Config);
    startAirseeker(tmpConfigFilename);
    await sleep(30_000);

    const beaconValueETHNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdETH);
    const beaconValueBTCNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdBTC);
    const beaconSetValueNew = await dapiServer.readDataFeedValueWithId(deployment.beaconSetId);

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(beaconValueETH));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(beaconValueBTC));
    expect(beaconSetValueNew).toEqual(hre.ethers.BigNumber.from(beaconSetValue));
  });

  it('updates if the DapiServer timestamp is older than heartbeatInterval', async () => {
    tmpConfigFilename = createTmpConfig({
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
              ],
              beaconSets: [
                {
                  beaconSetId: '0xf7f1620b7f422eb9a69c8e21b317ba1555d3d87e1d804f0b024f03b107e411e8',
                  deviationThreshold: 50,
                  heartbeatInterval: 10,
                },
              ],
              updateInterval: 10,
            },
          },
        },
      },
    } as Config);
    startAirseeker(tmpConfigFilename);
    await sleep(30_000);

    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const dapiServer = deployment.dapiServer.connect(voidSigner);

    const beaconValueETHNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdETH);
    const beaconValueBTCNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdBTC);
    const beaconSetValueNew = await dapiServer.readDataFeedValueWithId(deployment.beaconSetId);

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
    expect(beaconSetValueNew).toEqual(hre.ethers.BigNumber.from(21_900 * 1_000_000));
  });

  it('updates successfully after retrying a failed api call', async () => {
    tmpConfigFilename = createTmpConfig({
      ...airseekerConfig,
      gateways: {
        '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace': [
          {
            apiKey: '${HTTP_GATEWAY_API_KEY}',
            url: '${HTTP_SIGNED_DATA_GATEWAY_THROTTLED_URL}',
          },
        ],
      },
    } as Config);
    startAirseeker(tmpConfigFilename);
    await sleep(30_000);

    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const dapiServer = deployment.dapiServer.connect(voidSigner);

    const beaconValueETHNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdETH);
    const beaconValueBTCNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdBTC);
    const beaconSetValueNew = await dapiServer.readDataFeedValueWithId(deployment.beaconSetId);

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
    expect(beaconSetValueNew).toEqual(hre.ethers.BigNumber.from(21_900 * 1_000_000));
  });

  it('updates successfully with one invalid provider present', async () => {
    tmpConfigFilename = createTmpConfig({
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
            txType: 'legacy',
            fulfillmentGasLimit: 500_000,
            gasOracle: {
              maxTimeout: 1, // Set low to make tests run faster
              fallbackGasPrice: {
                value: 10,
                unit: 'gwei',
              },
              recommendedGasPriceMultiplier: 1,
              latestGasPriceOptions: {
                percentile: 60,
                minTransactionCount: 9,
                pastToCompareInBlocks: 20,
                maxDeviationMultiplier: 5, // Set high to ensure that e2e tests do not use fallback
              },
            },
          },
        },
      },
    } as Config);
    startAirseeker(tmpConfigFilename);
    await sleep(30_000);

    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const dapiServer = deployment.dapiServer.connect(voidSigner);

    const beaconValueETHNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdETH);
    const beaconValueBTCNew = await dapiServer.readDataFeedValueWithId(deployment.beaconIdBTC);
    const beaconSetValueNew = await dapiServer.readDataFeedValueWithId(deployment.beaconSetId);

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(800 * 1_000_000));
    expect(beaconValueBTCNew).toEqual(hre.ethers.BigNumber.from(43_000 * 1_000_000));
    expect(beaconSetValueNew).toEqual(hre.ethers.BigNumber.from(21_900 * 1_000_000));
  });

  it('throws on invalid airseeker config', async () => {
    tmpConfigFilename = createTmpConfig({
      ...airseekerConfig,
      chains: '',
    } as unknown as Config);
    startAirseeker(tmpConfigFilename);
    await sleep(5_000);

    let status: string | undefined;
    pm2.connect((err) => {
      if (err) throw err;

      pm2.describe(AIRSEEKER_E2E_PROCESS, (err, description) => {
        if (err) {
          logger.error(err.message);
          return pm2.disconnect();
        }

        status = description[0].pm2_env?.status;
        pm2.disconnect();
      });
    });
    await sleep(5_000);

    expect(status).toEqual('stopped');
  });
});
