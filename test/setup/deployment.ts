import { Contract, Wallet } from 'ethers';
import * as hre from 'hardhat';
import '@nomiclabs/hardhat-ethers';
import * as abi from '@api3/airnode-abi';
import * as node from '@api3/airnode-node';
import * as protocol from '@api3/airnode-protocol';
import {
  AccessControlRegistry__factory as AccessControlRegistryFactory,
  AirnodeProtocol__factory as AirnodeProtocolFactory,
  DapiServer__factory as DapiServerFactory,
} from '@api3/airnode-protocol-v1';
import { buildLocalConfigETH, buildLocalConfigBTC, buildLocalConfigLTC } from '../fixtures/config';

const subscriptionIdETH = '0xc1ed31de05a9aa74410c24bccd6aa40235006f9063f1c65d47401e97ad04560e';
const subscriptionIdBTC = '0xb4c3cea3b78c384eb4409df1497bb2f1fd872f1928a218f8907c38fe0d66ffea';
const subscriptionIdLTC = '0x74d8547ed2a09b41eb376455f65996a21b2e22fd832534d126639e3eec3a5c13';
const provider = new hre.ethers.providers.StaticJsonRpcProvider('http://127.0.0.1:8545');
const localConfigETH = buildLocalConfigETH();

const roles = {
  deployer: new hre.ethers.Wallet(localConfigETH.privateKeys.deployer).connect(provider),
  manager: new hre.ethers.Wallet(localConfigETH.privateKeys.manager).connect(provider),
  sponsor: new hre.ethers.Wallet(localConfigETH.privateKeys.sponsor).connect(provider),
  randomPerson: new hre.ethers.Wallet(localConfigETH.privateKeys.randomPerson).connect(provider),
};

const getTimestampAndSignature = async (airnodeWallet: Wallet, subscriptionId: string, sponsorWallet: Wallet) => {
  const timestamp = (await provider.getBlock('latest')).timestamp + 1;

  const signature = await airnodeWallet.signMessage(
    hre.ethers.utils.arrayify(
      hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(
          ['bytes32', 'uint256', 'address'],
          [subscriptionId, timestamp, sponsorWallet.address]
        )
      )
    )
  );

  return { timestamp, signature };
};

const signData = async (airnodeWallet: Wallet, templateId: string, data: string) => {
  const timestamp = (await provider.getBlock('latest')).timestamp + 100;

  const signature = await airnodeWallet.signMessage(
    hre.ethers.utils.arrayify(
      hre.ethers.utils.keccak256(
        hre.ethers.utils.solidityPack(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, data || '0x'])
      )
    )
  );

  return { timestamp, signature };
};

export const updateBeacon = async (
  dapiServer: Contract,
  airnodePspSponsorWallet: Wallet,
  airnodeWallet: Wallet,
  subscriptionId: string,
  apiValue: number
) => {
  const timestampAndSignature = await getTimestampAndSignature(airnodeWallet, subscriptionId, airnodePspSponsorWallet);
  await dapiServer
    .connect(airnodePspSponsorWallet)
    .fulfillPspBeaconUpdate(
      subscriptionId,
      airnodeWallet.address,
      airnodeWallet.address,
      roles.sponsor.address,
      timestampAndSignature.timestamp,
      hre.ethers.utils.defaultAbiCoder.encode(['int256'], [hre.ethers.BigNumber.from(apiValue)]),
      timestampAndSignature.signature,
      { gasLimit: 500_000 }
    );
};

export const deployAndUpdateSubscriptions = async () => {
  const dapiServerAdminRoleDescription = 'DapiServer admin';

  // Deploy contracts
  const accessControlRegistryFactory = new hre.ethers.ContractFactory(
    AccessControlRegistryFactory.abi,
    AccessControlRegistryFactory.bytecode,
    roles.deployer
  );
  const accessControlRegistry = await accessControlRegistryFactory.deploy();

  const airnodeProtocolFactory = new hre.ethers.ContractFactory(
    AirnodeProtocolFactory.abi,
    AirnodeProtocolFactory.bytecode,
    roles.deployer
  );
  const airnodeProtocol = await airnodeProtocolFactory.deploy();

  const dapiServerFactory = new hre.ethers.ContractFactory(
    DapiServerFactory.abi,
    DapiServerFactory.bytecode,
    roles.deployer
  );
  const dapiServer = await dapiServerFactory.deploy(
    accessControlRegistry.address,
    dapiServerAdminRoleDescription,
    roles.manager.address,
    airnodeProtocol.address
  );

  // Access control
  const managerRootRole = await accessControlRegistry.deriveRootRole(roles.manager.address);
  await accessControlRegistry
    .connect(roles.manager)
    .initializeRoleAndGrantToSender(managerRootRole, dapiServerAdminRoleDescription);

  // Wallets
  const airnodeWallet = hre.ethers.Wallet.fromMnemonic(localConfigETH.airnodeMnemonic);
  const airnodePspSponsorWallet = node.evm
    .deriveSponsorWalletFromMnemonic(localConfigETH.airnodeMnemonic, roles.sponsor.address, protocol.PROTOCOL_IDS.PSP)
    .connect(provider);
  await roles.deployer.sendTransaction({
    to: airnodePspSponsorWallet.address,
    value: hre.ethers.utils.parseEther('1'),
  });

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

  // Setup ETH Subscription
  // Templates
  const endpointIdETH = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(
      ['string', 'string'],
      [localConfigETH.endpoint.oisTitle, localConfigETH.endpoint.endpointName]
    )
  );
  const parametersETH = abi.encode(localConfigETH.templateParameters);
  const templateIdETH = hre.ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointIdETH, parametersETH]);

  // Subscriptions
  const thresholdETH = (await dapiServer.HUNDRED_PERCENT()).div(localConfigETH.threshold); // Update threshold %
  const beaconUpdateSubscriptionConditionParametersETH = hre.ethers.utils.defaultAbiCoder.encode(
    ['uint256'],
    [thresholdETH]
  );
  const beaconUpdateSubscriptionConditionsETH = [
    {
      type: 'bytes32',
      name: '_conditionFunctionId',
      value: hre.ethers.utils.defaultAbiCoder.encode(
        ['bytes4'],
        [dapiServer.interface.getSighash('conditionPspBeaconUpdate')]
      ),
    },
    { type: 'bytes', name: '_conditionParameters', value: beaconUpdateSubscriptionConditionParametersETH },
  ];
  const encodedBeaconUpdateSubscriptionConditionsETH = abi.encode(beaconUpdateSubscriptionConditionsETH);
  await dapiServer
    .connect(roles.randomPerson)
    .registerBeaconUpdateSubscription(
      airnodeWallet.address,
      templateIdETH,
      encodedBeaconUpdateSubscriptionConditionsETH,
      airnodeWallet.address,
      roles.sponsor.address
    );

  // Setup BTC Subscription
  const localConfigBTC = buildLocalConfigBTC();
  // Templates
  const endpointIdBTC = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(
      ['string', 'string'],
      [localConfigBTC.endpoint.oisTitle, localConfigBTC.endpoint.endpointName]
    )
  );
  const parametersBTC = abi.encode(localConfigBTC.templateParameters);
  const templateIdBTC = hre.ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointIdBTC, parametersBTC]);

  // Subscriptions
  const thresholdBTC = (await dapiServer.HUNDRED_PERCENT()).div(localConfigBTC.threshold); // Update threshold %
  const beaconUpdateSubscriptionConditionParameters2 = hre.ethers.utils.defaultAbiCoder.encode(
    ['uint256'],
    [thresholdBTC]
  );
  const beaconUpdateSubscriptionConditionsBTC = [
    {
      type: 'bytes32',
      name: '_conditionFunctionId',
      value: hre.ethers.utils.defaultAbiCoder.encode(
        ['bytes4'],
        [dapiServer.interface.getSighash('conditionPspBeaconUpdate')]
      ),
    },
    { type: 'bytes', name: '_conditionParameters', value: beaconUpdateSubscriptionConditionParameters2 },
  ];
  const encodedBeaconUpdateSubscriptionConditionsBTC = abi.encode(beaconUpdateSubscriptionConditionsBTC);
  await dapiServer
    .connect(roles.randomPerson)
    .registerBeaconUpdateSubscription(
      airnodeWallet.address,
      templateIdBTC,
      encodedBeaconUpdateSubscriptionConditionsBTC,
      airnodeWallet.address,
      roles.sponsor.address
    );

  // Setup LTC Subscription
  const localConfigLTC = buildLocalConfigLTC();
  // Templates
  const endpointIdLTC = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(
      ['string', 'string'],
      [localConfigLTC.endpoint.oisTitle, localConfigLTC.endpoint.endpointName]
    )
  );
  const parametersLTC = abi.encode(localConfigLTC.templateParameters);
  const templateIdLTC = hre.ethers.utils.solidityKeccak256(['bytes32', 'bytes'], [endpointIdLTC, parametersLTC]);

  // Subscriptions
  const thresholdLTC = (await dapiServer.HUNDRED_PERCENT()).div(localConfigLTC.threshold); // Update threshold %
  const beaconUpdateSubscriptionConditionParameters3 = hre.ethers.utils.defaultAbiCoder.encode(
    ['uint256'],
    [thresholdLTC]
  );
  const beaconUpdateSubscriptionConditionsLTC = [
    {
      type: 'bytes32',
      name: '_conditionFunctionId',
      value: hre.ethers.utils.defaultAbiCoder.encode(
        ['bytes4'],
        [dapiServer.interface.getSighash('conditionPspBeaconUpdate')]
      ),
    },
    { type: 'bytes', name: '_conditionParameters', value: beaconUpdateSubscriptionConditionParameters3 },
  ];
  const encodedBeaconUpdateSubscriptionConditionsLTC = abi.encode(beaconUpdateSubscriptionConditionsLTC);
  await dapiServer
    .connect(roles.randomPerson)
    .registerBeaconUpdateSubscription(
      airnodeWallet.address,
      templateIdLTC,
      encodedBeaconUpdateSubscriptionConditionsLTC,
      airnodeWallet.address,
      roles.sponsor.address
    );

  // Update beacons with starting values
  const apiValueETH = Math.floor(723.39202 * 1_000_000);
  const apiValueBTC = Math.floor(41_091.12345 * 1_000_000);
  const apiValueLTC = Math.floor(51.42 * 1_000_000);
  // ETH subscription
  await updateBeacon(dapiServer, airnodePspSponsorWallet, airnodeWallet, subscriptionIdETH, apiValueETH);
  // BTC subscription
  await updateBeacon(dapiServer, airnodePspSponsorWallet, airnodeWallet, subscriptionIdBTC, apiValueBTC);
  // LTC subscription
  await updateBeacon(dapiServer, airnodePspSponsorWallet, airnodeWallet, subscriptionIdLTC, apiValueLTC);
  const signedDataValue = '0x000000000000000000000000000000000000000000000000000000002bff42b7';
  const { timestamp: signedDataTimestamp, signature: signedDataSignature } = await signData(
    airnodeWallet,
    templateIdETH,
    signedDataValue
  );
  const signedData = {
    timestamp: signedDataTimestamp.toString(),
    encodedValue: signedDataValue,
    signature: signedDataSignature,
  };

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
  const tx = await dapiServer
    .connect(airnodePspSponsorWallet)
    .updateBeaconSetWithBeacons([beaconIdETH, beaconIdBTC], { gasLimit: 500_000 });
  await tx.wait();

  const beaconSetId = hre.ethers.utils.keccak256(
    hre.ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [[beaconIdETH, beaconIdBTC]])
  );

  return {
    accessControlRegistryFactory,
    accessControlRegistry,
    airnodeProtocolFactory,
    airnodeProtocol,
    dapiServerFactory,
    dapiServer,
    templateIdETH,
    templateIdBTC,
    airnodePspSponsorWallet,
    airnodeWallet,
    subscriptionIdETH,
    subscriptionIdBTC,
    signedData,
    beaconIdETH,
    beaconIdBTC,
    beaconIdLTC,
    beaconSetId,
  };
};
