import * as state from './state';
import { Config } from './validation';
import { initializeProvider, initializeProviders } from './providers';

describe('initializeProvider', () => {
  it('returns initialized provider', () => {
    const chainId = '5';
    const providerUrl = 'http://127.0.0.1:8545/';

    const provider = initializeProvider(chainId, providerUrl);
    expect(provider.chainId).toEqual(chainId);
    expect(provider.rpcProvider.connection.url).toEqual(providerUrl);
  });
});

describe('initializeProviders', () => {
  const config = {
    chains: {
      '1': {
        providers: {
          provider1: {
            url: 'https://some.provider1.url',
          },
          provider2: {
            url: 'https://some.provider2.url',
          },
        },
      },
      '3': {
        providers: {
          provider3: {
            url: 'https://some.provider3.url',
          },
        },
      },
      '4': {
        providers: {
          provider4: {
            url: 'https://some.provider4.url',
          },
        },
      },
    },
    triggers: {
      beaconUpdates: {
        '1': {},
        '2': {},
        '3': {},
      },
    },
  } as unknown as Config;
  state.initializeState(config);

  it('initialize providers', () => {
    initializeProviders();

    const { providers } = state.getState();

    expect(Object.keys(providers)).toHaveLength(2);

    const chain1Providers = providers['1'];
    expect(chain1Providers).toHaveLength(2);
    const chain1ProvidersUrls = chain1Providers.map((provider) => provider.rpcProvider.connection.url);
    expect(chain1ProvidersUrls).toContain('https://some.provider1.url');
    expect(chain1ProvidersUrls).toContain('https://some.provider2.url');

    const chain3Providers = providers['3'];
    expect(chain3Providers).toHaveLength(1);
    expect(chain3Providers[0].rpcProvider.connection.url).toEqual('https://some.provider3.url');
  });
});
