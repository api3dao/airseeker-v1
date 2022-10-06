import * as state from './state';
import { Config } from './validation';
import { initializeWallets } from './wallets';

describe('initializeWallets', () => {
  const config = {
    log: {
      format: 'plain',
      level: 'DEBUG',
    },
    airseekerWalletMnemonic: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
    triggers: {
      dataFeedUpdates: {
        1: {
          '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
            beacons: [],
            beaconSets: [],
            updateInterval: 30,
          },
        },
        3: {
          '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC': {
            beacons: [],
            beaconSets: [],
            updateInterval: 30,
          },
          '0x150700e52ba22fe103d60981c97bc223ac40dd4e': {
            beacons: [],
            beaconSets: [],
            updateInterval: 30,
          },
        },
      },
    },
  } as unknown as Config;
  state.initializeState(config);

  it('initialize wallets', () => {
    initializeWallets();

    const { airseekerWalletPrivateKey, sponsorWalletsPrivateKey } = state.getState();

    expect(typeof airseekerWalletPrivateKey).toBe('string');
    expect(airseekerWalletPrivateKey).toBe('0xd627c727db73ed7067cbc1e15295f7004b83c01d243aa90711d549cda6bd5bca');

    // Because 2 unique sponsorAddresses are placed, following test is expected to be 2.
    expect(Object.keys(sponsorWalletsPrivateKey)).toHaveLength(2);
    expect(typeof sponsorWalletsPrivateKey['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC']).toBe('string');
    expect(typeof sponsorWalletsPrivateKey['0x150700e52ba22fe103d60981c97bc223ac40dd4e']).toBe('string');
    expect(sponsorWalletsPrivateKey['0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC']).toBe(
      '0xcda66e77ae4eaab188a15717955f23cb7ee2a15f024eb272a7561cede1be427c'
    );
    expect(sponsorWalletsPrivateKey['0x150700e52ba22fe103d60981c97bc223ac40dd4e']).toBe(
      '0xf719b37066cff1e60726cfc8e656da47d509df3608d5ce38d94b6db93f03a54c'
    );
  });
});
