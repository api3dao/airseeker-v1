import { ethers } from 'ethers';
import { DapiServer } from '@api3/airnode-protocol-v1';
import { BeaconId, SignedData } from './validation';

export type BeaconValueStorage = Record<BeaconId, SignedData>;
export type Provider = {
  contract: DapiServer;
  rpcProvider: ethers.providers.StaticJsonRpcProvider;
  chainId: string;
};
// chainId => Provider[]
export type Providers = Record<string, Provider[]>;

export interface State {
  stopSignalReceived: boolean;
  beaconValues: BeaconValueStorage;
  providers: Providers;
}

export const createDefaultState: () => State = () => ({
  stopSignalReceived: false,
  beaconValues: {},
  providers: {},
});

// TODO: Freeze the state in development mode
let state = createDefaultState();

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
