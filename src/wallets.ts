import * as node from '@api3/airnode-node';
import * as protocol from '@api3/airnode-protocol';
import { ethers } from 'ethers';
import { uniq } from 'lodash';
import { getState, updateState, SponsorWalletsPrivateKey } from './state';

export const initializeAirseekerWallet = () => {
  const { config } = getState();

  // Derive airseeker wallet
  const airseekerWalletPrivateKey = ethers.Wallet.fromMnemonic(config.airseekerWalletMnemonic).privateKey;

  updateState((state) => ({ ...state, airseekerWalletPrivateKey }));
};

export const initializeSponsorWallets = () => {
  const { config } = getState();

  // Derive sponsor wallets
  const groupSponsorsByChain = Object.values(config.triggers.dataFeedUpdates);
  const uniqueSponsors = uniq(groupSponsorsByChain.flatMap(Object.keys));

  const sponsorWalletsPrivateKey: SponsorWalletsPrivateKey = Object.fromEntries(
    uniqueSponsors.map((sponsorAddress) => [
      sponsorAddress,
      node.evm.deriveSponsorWalletFromMnemonic(
        config.airseekerWalletMnemonic,
        sponsorAddress,
        protocol.PROTOCOL_IDS.AIRSEEKER
      ).privateKey,
    ])
  );

  updateState((state) => ({ ...state, sponsorWalletsPrivateKey }));
};

export const initializeWallets = () => {
  initializeAirseekerWallet();
  initializeSponsorWallets();
};
