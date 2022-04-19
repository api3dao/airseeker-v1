import { mockReadFileSync } from '../mock-utils';
import path from 'path';
import { ContractFactory, Contract, Wallet } from 'ethers';
import * as hre from 'hardhat';
import { checkUpdateCondition } from '../../src/check-condition';
import * as config from '../../src/config';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { updateBeacon, deployAndUpdateSubscriptions } from '../setup/deployment';

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(60_000);

const provider = new hre.ethers.providers.JsonRpcProvider('http://127.0.0.1:8545');
process.env = Object.assign(process.env, {
  CLOUD_PROVIDER: 'local',
  STAGE: 'dev',
});
const airseekerConfig = buildAirseekerConfig();
const secretsConfig = buildLocalSecrets();

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

const runAirseeker = async (
  apiValue: number,
  templateId: string,
  dapiServer: Contract,
  airnodePspSponsorWallet: Wallet,
  airnodeWallet: Wallet,
  subscriptionId: string
) => {
  const _airseekerConfig = config.loadConfig(
    path.join(__dirname, '..', '..', 'config', 'airseeker.example.json'),
    secretsConfig
  );
  try {
    const voidSigner = new hre.ethers.VoidSigner(hre.ethers.constants.AddressZero, provider);
    const beaconId = hre.ethers.utils.keccak256(
      hre.ethers.utils.solidityPack(['address', 'bytes32'], [airnodeWallet.address, templateId])
    );
    const checkResult = await checkUpdateCondition(voidSigner, dapiServer, beaconId, 0.1, apiValue);

    //Update beacon if check passes
    if (checkResult) {
      await updateBeacon(dapiServer, airnodePspSponsorWallet, airnodeWallet, subscriptionId, apiValue);
    }

    return { status: 200 };
  } catch (error) {
    return { error };
  }
};

describe('PSP', () => {
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

    deployment = await deployAndUpdateSubscriptions();
  });

  it('updates the beacons successfully', async () => {
    jest.spyOn(config, 'readConfig').mockImplementationOnce(() => airseekerConfig as any);

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

    // const config = [
    //   { templateId: templateIdETH, subscriptionId: subscriptionIdETH, apiValue: 800 * 1_000_000 },
    //   { templateId: templateIdBTC, subscriptionId: subscriptionIdBTC, apiValue: 43_000 * 1_000_000 },
    // ];

    const resETH = await runAirseeker(
      800 * 1_000_000,
      deployment.templateIdETH,
      deployment.dapiServer,
      deployment.airnodePspSponsorWallet,
      deployment.airnodeWallet,
      deployment.subscriptionIdETH
    );

    const resBTC = await runAirseeker(
      43_000 * 1_000_000,
      deployment.templateIdBTC,
      deployment.dapiServer,
      deployment.airnodePspSponsorWallet,
      deployment.airnodeWallet,
      deployment.subscriptionIdBTC
    );

    expect(resETH).toEqual({ status: 200 });
    expect(resBTC).toEqual({ status: 200 });

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
    jest.spyOn(config, 'readConfig').mockImplementationOnce(() => airseekerConfig as any);

    const beaconValueETH = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );
    expect(beaconValueETH).toEqual(hre.ethers.BigNumber.from(723.39202 * 1_000_000));

    const resETH = await runAirseeker(
      724 * 1_000_000,
      deployment.templateIdETH,
      deployment.dapiServer,
      deployment.airnodePspSponsorWallet,
      deployment.airnodeWallet,
      deployment.subscriptionIdETH
    );

    expect(resETH).toEqual({ status: 200 });

    const beaconValueETHNew = await readBeaconValue(
      '0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace',
      deployment.templateIdETH,
      deployment.dapiServer
    );

    expect(beaconValueETHNew).toEqual(hre.ethers.BigNumber.from(723.39202 * 1_000_000));
  });

  it('throws on invalid airseeker config', async () => {
    mockReadFileSync(
      'airseeker.example.json',
      JSON.stringify({
        ...airseekerConfig,
        chains: '',
      })
    );
    await expect(runAirseeker).rejects.toThrow('Invalid Airseeker configuration file');
  });
});
