import * as node from '@api3/airnode-node';
import { getState, Provider, Providers, updateState } from './state';

export const initializeProvider = (chainId: string, providerUrl: string): Omit<Provider, 'providerName'> => {
  const rpcProvider = node.evm.buildEVMProvider(providerUrl, chainId);

  return { rpcProvider, chainId };
};

export const initializeProviders = () => {
  const { config } = getState();
  const sponsorBeaconsByChainId = Object.keys(config.triggers.beaconUpdates);
  const providers = sponsorBeaconsByChainId.reduce((acc: Providers, chainId: string) => {
    const chain = config.chains[chainId];

    const chainProviders = Object.entries(chain.providers).map(([providerName, provider]) => ({
      ...initializeProvider(chainId, provider.url),
      providerName,
    }));

    return { ...acc, [chainId]: chainProviders };
  }, {});

  updateState((state) => ({ ...state, providers }));
};
