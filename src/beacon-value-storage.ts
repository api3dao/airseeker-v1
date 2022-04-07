export type BeaconValue = any; // TODO: type
export type BeaconValueStorage = Record<string, BeaconValue>;

const beaconValues: BeaconValueStorage = {};

export const saveBeaconValue = (id: string, value: BeaconValue) => {
  console.log(`Saving beacon value: ${JSON.stringify(value)} for beacon ID: ${id}`);

  // eslint-disable-next-line functional/immutable-data
  beaconValues[id] = value;
};

export const getBeaconValue = (id: string) => {
  return beaconValues[id];
};
