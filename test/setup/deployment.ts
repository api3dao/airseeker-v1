import * as hre from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import * as abi from '@api3/airnode-abi';
import * as node from '@api3/airnode-node';
import * as protocol from '@api3/airnode-protocol';
import {
  AccessControlRegistry__factory as AccessControlRegistryFactory,
  Api3ServerV1__factory as Api3ServerV1Factory,
} from '@api3/airnode-protocol-v1';
import { Contract, Wallet } from 'ethers';
import { SignedData } from '../../src/validation';
import { buildLocalConfigBTC, buildLocalConfigETH, buildLocalConfigLTC } from '../fixtures/config';

const provider = new hre.ethers.providers.StaticJsonRpcProvider('http://127.0.0.1:8545');
const localConfigETH = buildLocalConfigETH();

const roles = {
  deployer: new hre.ethers.Wallet(localConfigETH.privateKeys.deployer).connect(provider),
  manager: new hre.ethers.Wallet(localConfigETH.privateKeys.manager).connect(provider),
  sponsor: new hre.ethers.Wallet(localConfigETH.privateKeys.sponsor).connect(provider),
  randomPerson: new hre.ethers.Wallet(localConfigETH.privateKeys.randomPerson).connect(provider),
};

const updateBeacon = async (
  api3ServerV1: Contract,
  airnodeWallet: Wallet,
  airseekerSponsorWallet: Wallet,
  templateId: string,
  apiValue: number
) => {
  const signedData = await signData(
    airnodeWallet,
    templateId,
    (await provider.getBlock('latest')).timestamp + 1,
    apiValue
  );

  await api3ServerV1
    .connect(airseekerSponsorWallet)
    .updateBeaconWithSignedData(
      airnodeWallet.address,
      templateId,
      signedData.timestamp,
      signedData.encodedValue,
      signedData.signature
    );
};

const signData = async (
  airnodeWallet: Wallet,
  templateId: string,
  timestamp: number,
  apiValue: number
): Promise<SignedData> => {
  const encodedValue = hre.ethers.utils.defaultAbiCoder.encode(['uint224'], [hre.ethers.BigNumber.from(apiValue)]);

  const signature = await airnodeWallet.signMessage(
    hre.ethers.utils.arrayify(
      hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, encodedValue || '0x'])
      )
    )
  );

  return {
    timestamp: timestamp.toString(),
    encodedValue,
    signature,
  };
};

export const deployAndUpdate = async () => {
  const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';

  // Deploy contracts
  const accessControlRegistryFactory = new hre.ethers.ContractFactory(
    AccessControlRegistryFactory.abi,
    AccessControlRegistryFactory.bytecode,
    roles.deployer
  );
  const accessControlRegistry = await accessControlRegistryFactory.deploy();

  const api3ServerV1Factory = new hre.ethers.ContractFactory(
    Api3ServerV1Factory.abi,
    Api3ServerV1Factory.bytecode,
    roles.deployer
  );
  const api3ServerV1 = await api3ServerV1Factory.deploy(
    accessControlRegistry.address,
    api3ServerV1AdminRoleDescription,
    roles.manager.address
  );

  // Access control
  const managerRootRole = hre.ethers.utils.solidityKeccak256(['address'], [roles.manager.address]);
  await accessControlRegistry
    .connect(roles.manager)
    .initializeRoleAndGrantToSender(managerRootRole, api3ServerV1AdminRoleDescription);

  // Wallets
  const airnodeWallet = hre.ethers.Wallet.fromMnemonic(localConfigETH.airnodeMnemonic);

  const airseekerSponsorWallet = node.evm
    .deriveSponsorWalletFromMnemonic(
      localConfigETH.airnodeMnemonic,
      roles.sponsor.address,
      protocol.PROTOCOL_IDS.AIRSEEKER
    )
    .connect(provider);

  await roles.deployer.sendTransaction({
    to: airseekerSponsorWallet.address,
    value: hre.ethers.utils.parseEther('1'),
  });

  // Templates for ETH
  const endpointIdETH = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(
      ['string', 'string'],
      [localConfigETH.endpoint.oisTitle, localConfigETH.endpoint.endpointName]
    )
  );
  const parametersETH = abi.encode(localConfigETH.templateParameters);
  const templateIdETH = hre.ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointIdETH, parametersETH]);

  // Templates for BTC
  const localConfigBTC = buildLocalConfigBTC();
  const endpointIdBTC = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(
      ['string', 'string'],
      [localConfigBTC.endpoint.oisTitle, localConfigBTC.endpoint.endpointName]
    )
  );
  const parametersBTC = abi.encode(localConfigBTC.templateParameters);
  const templateIdBTC = hre.ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointIdBTC, parametersBTC]);

  // Templates for LTC
  const localConfigLTC = buildLocalConfigLTC();
  const endpointIdLTC = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(
      ['string', 'string'],
      [localConfigLTC.endpoint.oisTitle, localConfigLTC.endpoint.endpointName]
    )
  );
  const parametersLTC = abi.encode(localConfigLTC.templateParameters);
  const templateIdLTC = hre.ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointIdLTC, parametersLTC]);

  // Update beacons with starting values
  const apiValueETHInitial = Math.floor(723.39202 * 1_000_000);
  const apiValueETH = Math.floor(738.149047 * 1_000_000);
  const apiValueBTC = Math.floor(41_091.12345 * 1_000_000);
  const apiValueLTC = Math.floor(51.42 * 1_000_000);

  await updateBeacon(api3ServerV1, airnodeWallet, airseekerSponsorWallet, templateIdETH, apiValueETHInitial);
  await updateBeacon(api3ServerV1, airnodeWallet, airseekerSponsorWallet, templateIdBTC, apiValueBTC);

  const signedDataETH = await signData(
    airnodeWallet,
    templateIdETH,
    (await provider.getBlock('latest')).timestamp + 100,
    apiValueETH
  );

  const signedDataBTC = await signData(
    airnodeWallet,
    templateIdBTC,
    (await provider.getBlock('latest')).timestamp + 100,
    apiValueBTC
  );

  const signedDataLTC = await signData(
    airnodeWallet,
    templateIdLTC,
    (await provider.getBlock('latest')).timestamp + 100,
    apiValueLTC
  );

  const beaconIdETH = hre.ethers.utils.keccak256(
    hre.ethers.utils.solidityPack(['address', 'bytes32'], ['0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace', templateIdETH])
  );
  const beaconIdBTC = hre.ethers.utils.keccak256(
    hre.ethers.utils.solidityPack(['address', 'bytes32'], ['0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace', templateIdBTC])
  );
  const beaconIdLTC = hre.ethers.utils.keccak256(
    hre.ethers.utils.solidityPack(['address', 'bytes32'], ['0xA30CA71Ba54E83127214D3271aEA8F5D6bD4Dace', templateIdLTC])
  );

  // BeaconSet update
  const tx = await api3ServerV1
    .connect(airseekerSponsorWallet)
    .updateBeaconSetWithBeacons([beaconIdETH, beaconIdBTC], { gasLimit: 500_000 });
  await tx.wait();

  const beaconSetId = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [[beaconIdETH, beaconIdBTC]])
  );

  return {
    accessControlRegistryFactory,
    accessControlRegistry,
    api3ServerV1Factory,
    api3ServerV1,
    templateIdETH,
    templateIdBTC,
    templateIdLTC,
    airnodeWallet,
    signedDataETH,
    signedDataBTC,
    signedDataLTC,
    beaconIdETH,
    beaconIdBTC,
    beaconIdLTC,
    beaconSetId,
  };
};
