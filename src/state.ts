import { ethers } from 'ethers';
import { LogOptions } from '@api3/airnode-utilities';
import { BeaconId, Config, SignedData } from './validation';
import { DEFAULT_LOG_OPTIONS } from './constants';

export type BeaconValueStorage = Record<BeaconId, SignedData>;
export type Provider = {
  rpcProvider: ethers.providers.StaticJsonRpcProvider;
  chainId: string;
};
// chainId => Provider[]
export type Providers = Record<string, Provider[]>;

export interface State {
  config: Config;
  stopSignalReceived: boolean;
  beaconValues: BeaconValueStorage;
  providers: Providers;
  logOptions: LogOptions;
}

// TODO: Freeze the state in development mode
let state: State;

export const initializeState = (config: Config) => {
  state = {
    config,
    stopSignalReceived: false,
    beaconValues: {},
    providers: {},
    logOptions: DEFAULT_LOG_OPTIONS,
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
