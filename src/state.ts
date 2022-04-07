import { BeaconId } from './validation';

export type BeaconValue = any; // TODO: type
export type BeaconValueStorage = Record<BeaconId, BeaconValue>;

export interface State {
  stopSignalReceived: boolean;
  beaconValues: BeaconValueStorage;
}

export const createDefaultState: () => State = () => ({
  stopSignalReceived: false,
  beaconValues: {},
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
