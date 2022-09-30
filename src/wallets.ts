import * as node from '@api3/airnode-node';
import * as protocol from '@api3/airnode-protocol';
import { ethers } from 'ethers';
import { uniq } from 'lodash';
import { getState, updateState, SponsorWallets } from './state';

export const initializeAirseekerWallet = () => {
  const { config } = getState();

  // Derive airseeker wallet
  const airseekerWallet = ethers.Wallet.fromMnemonic(config.airseekerWalletMnemonic);

  updateState((state) => ({ ...state, airseekerWallet }));
};

export const initializeSponsorWallets = () => {
  const { config } = getState();

  // Derive sponsor wallets
  const groupSponsorsByChain = Object.values(config.triggers.dataFeedUpdates);
  const uniqueSponsors = uniq(groupSponsorsByChain.flatMap((sponsorDict) => Object.keys(sponsorDict)));

  const sponsorWallets: SponsorWallets = Object.fromEntries(
    uniqueSponsors.map((sponsorAddress) => [
      sponsorAddress,
      node.evm.deriveSponsorWalletFromMnemonic(
        config.airseekerWalletMnemonic,
        sponsorAddress,
        protocol.PROTOCOL_IDS.AIRSEEKER
      ),
    ])
  );

  updateState((state) => ({ ...state, sponsorWallets }));
};

export const initializeWallets = () => {
  initializeAirseekerWallet();
  initializeSponsorWallets();
};
