require('@nomiclabs/hardhat-ethers');
const hre = require('hardhat');
const node = require('@api3/airnode-node');
const {
  AccessControlRegistry__factory: AccessControlRegistryFactory,
  AirnodeProtocol__factory: AirnodeProtocolFactory,
  DapiServer__factory: DapiServerFactory,
} = require('@api3/airnode-protocol-v1');
const { PROTOCOL_ID } = require('../src/constants');

async function main() {
  const [deployer, manager, sponsor] = await hre.ethers.getSigners();

  const dapiServerAdminRoleDescription = 'DapiServer admin';

  // Deploy contracts
  const accessControlRegistryFactory = new hre.ethers.ContractFactory(
    AccessControlRegistryFactory.abi,
    AccessControlRegistryFactory.bytecode,
    deployer
  );
  const accessControlRegistry = await accessControlRegistryFactory.connect(deployer).deploy();

  const airnodeProtocolFactory = new hre.ethers.ContractFactory(
    AirnodeProtocolFactory.abi,
    AirnodeProtocolFactory.bytecode,
    deployer
  );
  const airnodeProtocol = await airnodeProtocolFactory.connect(deployer).deploy();

  const dapiServerFactory = new hre.ethers.ContractFactory(DapiServerFactory.abi, DapiServerFactory.bytecode, deployer);
  const dapiServer = await dapiServerFactory
    .connect(deployer)
    .deploy(accessControlRegistry.address, dapiServerAdminRoleDescription, manager.address, airnodeProtocol.address);

  console.log('🚀 DapiServer address:', dapiServer.address);

  // Access control
  const managerRootRole = await accessControlRegistry.deriveRootRole(manager.address);
  await accessControlRegistry
    .connect(manager)
    .initializeRoleAndGrantToSender(managerRootRole, dapiServerAdminRoleDescription);

  const airseekerSponsorWallet = node.evm.deriveSponsorWalletFromMnemonic(
    'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
    sponsor.address,
    PROTOCOL_ID
  );

  await deployer.sendTransaction({
    to: airseekerSponsorWallet.address,
    value: hre.ethers.utils.parseEther('1'),
  });

  console.log('🚀 Sent 1 ETH to Airseeker sponsor wallet', airseekerSponsorWallet.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
