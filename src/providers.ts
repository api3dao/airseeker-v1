import { uniq } from 'lodash';
import references from '@api3/airnode-protocol';
import * as v1 from '@api3/airnode-protocol-v1';
import { ethers } from 'ethers';
import { Network } from '@ethersproject/networks';
import Bottleneck from 'bottleneck';
import { ConnectionInfo, poll } from '@ethersproject/web';
import { getState, Provider, Providers, updateState } from './state';
import {
  PROVIDER_MAX_CONCURRENCY_DEFAULT,
  PROVIDER_MIN_TIME_DEFAULT,
  PROVIDER_TIMEOUT_HEADROOM_MS,
  PROVIDER_TIMEOUT_MS,
} from './constants';
import { Config } from './validation';

/**
 * LimitedProvider rate limits Provider calls
 */
export class RateLimitedProvider extends ethers.providers.StaticJsonRpcProvider {
  public limiter: Bottleneck;

  constructor(url: ConnectionInfo | string, network: Network | undefined, limiter: Bottleneck) {
    super(url, network);
    this.limiter = limiter;
  }

  public perform(method: string, params: any) {
    return poll(() => {
      return this.limiter.schedule(() => {
        return super.perform(method, params).then((result) => {
          return result;
        }, Promise.reject);
      });
    });
  }
}

export const getNetwork = (chainId: string): Network | undefined => {
  if (references?.networks[chainId]) {
    return references?.networks[chainId];
  }

  const chainName = v1.references.chainNames[chainId];
  if (!chainName) {
    return undefined;
  }

  return {
    name: chainName,
    chainId: parseInt(chainId),
  };
};

export const initializeProvider = (
  chainId: string,
  providerUrl: string,
  config?: Config
): Omit<Provider, 'providerName'> => {
  const rpcProvider = new RateLimitedProvider(
    {
      url: providerUrl,
      timeout: PROVIDER_TIMEOUT_MS - PROVIDER_TIMEOUT_HEADROOM_MS,
    },
    getNetwork(chainId),
    new Bottleneck({
      minTime: config?.rateLimiting?.minProviderTime ?? PROVIDER_MIN_TIME_DEFAULT,
      maxConcurrent: config?.rateLimiting?.maxProviderConcurrency ?? PROVIDER_MAX_CONCURRENCY_DEFAULT,
    })
  );

  return { rpcProvider, chainId };
};

export const initializeProviders = () => {
  const { config } = getState();
  const triggersUpdatesChains = uniq([...Object.keys(config.triggers.dataFeedUpdates)]);
  const providers = triggersUpdatesChains.reduce((acc: Providers, chainId: string) => {
    const chain = config.chains[chainId];

    const chainProviders = Object.entries(chain.providers).map(([providerName, provider]) => ({
      ...initializeProvider(chainId, provider.url, config), // EVM_PROVIDER_TIMEOUT is 10_000
      providerName,
    }));

    return { ...acc, [chainId]: chainProviders };
  }, {});

  updateState((state) => ({ ...state, providers }));
};
