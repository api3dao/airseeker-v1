import { ethers } from 'ethers';

export const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export const shortenAddress = (address: string) => address.replace(address.substring(5, 38), '...');

// TODO: Remove once airnode-node 0.6.0 is released
const deriveWalletPathFromSponsorAddress = (sponsorAddress: string, protocolId = '1') => {
  const sponsorAddressBN = ethers.BigNumber.from(ethers.utils.getAddress(sponsorAddress));
  const paths = [];
  for (let i = 0; i < 6; i++) {
    const shiftedSponsorAddressBN = sponsorAddressBN.shr(31 * i);
    paths.push(shiftedSponsorAddressBN.mask(31).toString());
  }
  return `${protocolId}/${paths.join('/')}`;
};

export const deriveSponsorWalletFromMnemonic = (airnodeMnemonic: string, sponsorAddress: string, protocolId: string) =>
  ethers.Wallet.fromMnemonic(
    airnodeMnemonic,
    `m/44'/60'/0'/${deriveWalletPathFromSponsorAddress(sponsorAddress, protocolId)}`
  );
