import * as node from '@api3/airnode-node';
import { logger } from './logging';
import { getState, updateState, Providers } from './state';

const initializeProvider = (chainId: string, providerUrl: string) => {
  const rpcProvider = node.evm.buildEVMProvider(providerUrl, chainId);

  return { rpcProvider, chainId };
};

export const initializeProviders = () => {
  const { config } = getState();
  const chains = Object.keys(config.triggers.beaconUpdates);
  const providers = chains.reduce((acc: Providers, chainId: string) => {
    const chain = config.chains[chainId];

    // TODO: Should be later part of the validation
    if (!chain) {
      logger.log(`Missing chain definition for chain with ID ${chainId} `);
      return acc;
    }

    const chainProviders = Object.values(chain.providers).map((provider) => initializeProvider(chainId, provider.url));

    return { ...acc, [chainId]: chainProviders };
  }, {});

  updateState((state) => ({ ...state, providers }));
};
