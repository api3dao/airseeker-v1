import { uniq } from 'lodash';
import references from '@api3/airnode-protocol';
import * as v1 from '@api3/airnode-protocol-v1';
import { ethers } from 'ethers';
import { getState, Provider, Providers, updateState } from './state';
import { PROVIDER_TIMEOUT_HEADROOM_MS, PROVIDER_TIMEOUT_MS } from './constants';

export const initializeProvider = (chainId: string, providerUrl: string): Omit<Provider, 'providerName'> => {
  const network = references.networks[chainId] ?? v1.references.chainNames[chainId] ?? null;

  const rpcProvider = new ethers.providers.StaticJsonRpcProvider(
    {
      url: providerUrl,
      timeout: PROVIDER_TIMEOUT_MS - PROVIDER_TIMEOUT_HEADROOM_MS,
    },
    network
  );

  return { rpcProvider, chainId };
};

export const initializeProviders = () => {
  const { config } = getState();
  const triggersUpdatesChains = uniq([...Object.keys(config.triggers.dataFeedUpdates)]);
  const providers = triggersUpdatesChains.reduce((acc: Providers, chainId: string) => {
    const chain = config.chains[chainId];

    const chainProviders = Object.entries(chain.providers).map(([providerName, provider]) => ({
      ...initializeProvider(chainId, provider.url), // EVM_PROVIDER_TIMEOUT is 10_000
      providerName,
    }));

    return { ...acc, [chainId]: chainProviders };
  }, {});

  updateState((state) => ({ ...state, providers }));
};
