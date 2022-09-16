import { setLogOptions, randomHexString } from '@api3/airnode-utilities';
import { ethers } from 'ethers';
import { BeaconId, Config, SignedData } from './validation';

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

export interface State {
  config: Config;
  stopSignalReceived: boolean;
  beaconValues: BeaconValueStorage;
  providers: Providers;
}

// TODO: Freeze the state in development mode
let state: State;

export const initializeState = (config: Config) => {
  state = getInitialState(config);
};

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
