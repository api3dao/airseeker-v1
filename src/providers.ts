import { uniq } from 'lodash';
import references from '@api3/airnode-protocol';
import * as v1 from '@api3/airnode-protocol-v1';
import { ethers } from 'ethers';
import { Network } from '@ethersproject/networks';
import Bottleneck from 'bottleneck';
import { ConnectionInfo } from '@ethersproject/web';
import { getRandomId, getState, Provider, Providers, updateState } from './state';
import {
  PROVIDER_MAX_CONCURRENCY_DEFAULT,
  PROVIDER_MIN_TIME_DEFAULT_MS,
  PROVIDER_TIMEOUT_HEADROOM_DEFAULT_MS,
  PROVIDER_TIMEOUT_MS,
} from './constants';
import { Config, LimiterConfig } from './validation';
import { logger } from './logging';

/**
 * LimitedProvider rate limits Provider calls
 */
export class RateLimitedProvider extends ethers.providers.StaticJsonRpcProvider {
  public limiter: Bottleneck;
  public id = Math.floor(Math.random() * 1_000)
    .toString(16)
    .padStart(6, ' ');
  public debug: boolean;

  /**
   * Construct a new Rate limited provider
   *
   * @param url
   * @param network
   * @param limiter
   * @param debug whether to print Bottleneck-related debugging data
   */
  constructor(url: ConnectionInfo | string, network: Network | undefined, limiter: Bottleneck, debug = false) {
    super(url, network);
    this.limiter = limiter;
    this.debug = debug;
  }

  /**
   * Return the underlying rate limiter in this provider.
   */
  getLimiter = () => this.limiter;

  /**
   * Return a StaticJsonRpcProvider with this provider's configuration
   */
  getProvider = () =>
    new ethers.providers.StaticJsonRpcProvider(
      {
        url: this.connection.url,
        timeout: this.connection.timeout,
      },
      this.network
    );

  /**
   * Override the base class's perform method to send all calls via the limiter.
   * This will cause upstream timeouts to potentially trigger (eg. airnode utils)
   *
   * @param method
   * @param params
   */
  perform = (method: string, params: any) => {
    if (this.debug)
      logger.debug(
        `Provider ID: ${this.id} | Limiter Jobs: ${this.limiter
          .jobs()
          .length.toString()
          .padStart(5, ' ')} OUTER Perform in rate-limited provider`
      );
    return this.limiter.schedule({ expiration: 60_000 }, () => {
      if (this.debug)
        logger.debug(
          `Provider ID: ${this.id} | Limiter Jobs: ${this.limiter
            .jobs()
            .length.toString()
            .padStart(5, ' ')} INNER Perform in rate-limited provider`
        );
      return super.perform(method, params);
    });
  };
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
  config?: Config,
  rateLimiter?: LimiterConfig
): Omit<Provider, 'providerName'> => {
  const rpcProvider = new RateLimitedProvider(
    {
      url: providerUrl,
      timeout: PROVIDER_TIMEOUT_MS - PROVIDER_TIMEOUT_HEADROOM_DEFAULT_MS,
    },
    getNetwork(chainId),
    new Bottleneck({
      id: getRandomId(),
      minTime: rateLimiter?.minTime ?? config?.rateLimiting?.minProviderTime ?? PROVIDER_MIN_TIME_DEFAULT_MS,
      maxConcurrent:
        rateLimiter?.maxConcurrent ?? config?.rateLimiting?.maxProviderConcurrency ?? PROVIDER_MAX_CONCURRENCY_DEFAULT,
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
      ...initializeProvider(chainId, provider.url, config, provider?.rateLimiter), // EVM_PROVIDER_TIMEOUT is 10_000
      providerName,
    }));

    return { ...acc, [chainId]: chainProviders };
  }, {});

  updateState((state) => ({ ...state, providers }));
};
