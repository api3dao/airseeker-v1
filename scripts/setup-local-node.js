require('@nomiclabs/hardhat-ethers');
const hre = require('hardhat');
const node = require('@api3/airnode-node');
const protocol = require('@api3/airnode-protocol');
const {
  AccessControlRegistry__factory: AccessControlRegistryFactory,
  AirnodeProtocol__factory: AirnodeProtocolFactory,
  DapiServer__factory: DapiServerFactory,
} = require('@api3/airnode-protocol-v1');

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
  const managerRootRole = hre.ethers.utils.solidityKeccak256(['address'], [manager.address]);
  await accessControlRegistry
    .connect(manager)
    .initializeRoleAndGrantToSender(managerRootRole, dapiServerAdminRoleDescription);

  const airseekerSponsorWallet = node.evm.deriveSponsorWalletFromMnemonic(
    'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
    sponsor.address,
    protocol.PROTOCOL_IDS.AIRSEEKER
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
