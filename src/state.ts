import { setLogOptions, randomHexString } from '@api3/airnode-utilities';
import { ethers } from 'ethers';
import Bottleneck from 'bottleneck';
import { BeaconId, Config, Gateway, SignedData } from './validation';
import { GatewayWithLimiter } from './make-request';
import { GATEWAY_MAX_CONCURRENCY_DEFAULT, GATEWAY_MINIMUM_TIME_DEFAULT } from './constants';

export type Id<T> = T & {
  id: string;
};

export type BeaconValueStorage = Record<BeaconId, SignedData>;
export type Provider = {
  rpcProvider: ethers.providers.StaticJsonRpcProvider;
  chainId: string;
  providerName: string;
};
// chainId => Provider[]
export type Providers = Record<string, Provider[]>;
// sponsorAddress => sponsorWallet
export type SponsorWalletsPrivateKey = Record<string, string>;

export interface State {
  config: Config;
  stopSignalReceived: boolean;
  beaconValues: BeaconValueStorage;
  providers: Providers;
  airseekerWalletPrivateKey: string;
  sponsorWalletsPrivateKey: SponsorWalletsPrivateKey;
  gatewaysWithLimiters: Record<string, GatewayWithLimiter[]>;
}

// TODO: Freeze the state in development mode
let state: State;

export const initializeState = (config: Config) => {
  state = getInitialState(config);
};

export const addLimitersToSingleAirnodeGateways = (gateways: Gateway[], config?: Config) =>
  gateways.map((gateway) => ({
    ...(gateway as Gateway),
    queue: new Bottleneck({
      maxConcurrent: config?.rateLimiting?.maxGatewayConcurrency ?? GATEWAY_MAX_CONCURRENCY_DEFAULT,
      minTime: config?.rateLimiting?.minGatewayTime ?? GATEWAY_MINIMUM_TIME_DEFAULT,
    }),
  }));

export const addLimitersToGateways = (gateways?: Record<string, Gateway[]>, config?: Config) =>
  gateways
    ? Object.fromEntries(
        Object.entries(gateways).map(([key, gateways]) => [key, addLimitersToSingleAirnodeGateways(gateways, config)])
      )
    : {};

export const getInitialState = (config: Config) => {
  // Set initial log options
  setLogOptions({
    ...config.log,
    meta: { 'Coordinator-ID': randomHexString(16) },
  });
  return {
    config,
    stopSignalReceived: false,
    beaconValues: {},
    providers: {},
    gatewaysWithLimiters: addLimitersToGateways(config.gateways),
    airseekerWalletPrivateKey: '',
    sponsorWalletsPrivateKey: {},
  };
};

type StateUpdater = (state: State) => State;
export const updateState = (updater: StateUpdater) => {
  setState(updater(state));
};

export const setState = (newState: State) => {
  state = newState;
};

export const getState = () => {
  return state;
};
