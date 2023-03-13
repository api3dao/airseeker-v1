require('@nomiclabs/hardhat-ethers');
const hre = require('hardhat');
const node = require('@api3/airnode-node');
const protocol = require('@api3/airnode-protocol');
const {
  AccessControlRegistry__factory: AccessControlRegistryFactory,
  Api3ServerV1__factory: Api3ServerV1Factory,
} = require('@api3/airnode-protocol-v1');

async function main() {
  const [deployer, manager, sponsor] = await hre.ethers.getSigners();

  const api3ServerV1AdminRoleDescription = 'Api3ServerV1 admin';

  // Deploy contracts
  const accessControlRegistryFactory = new hre.ethers.ContractFactory(
    AccessControlRegistryFactory.abi,
    AccessControlRegistryFactory.bytecode,
    deployer
  );
  const accessControlRegistry = await accessControlRegistryFactory.connect(deployer).deploy();

  const api3ServerV1Factory = new hre.ethers.ContractFactory(
    Api3ServerV1Factory.abi,
    Api3ServerV1Factory.bytecode,
    deployer
  );
  const api3ServerV1 = await api3ServerV1Factory
    .connect(deployer)
    .deploy(accessControlRegistry.address, api3ServerV1AdminRoleDescription, manager.address);

  console.log('🚀 Api3ServerV1 address:', api3ServerV1.address);

  // Access control
  const managerRootRole = hre.ethers.utils.solidityKeccak256(['address'], [manager.address]);
  await accessControlRegistry
    .connect(manager)
    .initializeRoleAndGrantToSender(managerRootRole, api3ServerV1AdminRoleDescription);

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
