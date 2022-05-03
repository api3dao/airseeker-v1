import * as node from '@api3/airnode-node';
import { logger } from './logging';
import { getState, updateState, Providers, Provider } from './state';

export const initializeProvider = (chainId: string, providerUrl: string): Omit<Provider, 'providerName'> => {
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
      logger.warn(`Missing chain definition for chain with ID ${chainId}`);
      return acc;
    }

    const chainProviders = Object.entries(chain.providers).map(([providerName, provider]) => ({
      ...initializeProvider(chainId, provider.url),
      providerName,
    }));

    return { ...acc, [chainId]: chainProviders };
  }, {});

  updateState((state) => ({ ...state, providers }));
};
