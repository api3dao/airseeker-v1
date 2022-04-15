import * as node from '@api3/airnode-node';
import { DapiServer__factory } from '@api3/airnode-protocol-v1';
import { getState, updateState, Providers } from './state';

const initializeProvider = (chainId: string, contractAddress: string, providerUrl: string) => {
  const rpcProvider = node.evm.buildEVMProvider(providerUrl, chainId);
  const contract = DapiServer__factory.connect(contractAddress, rpcProvider);

  return { rpcProvider, contract, chainId };
};

export const initializeProviders = () => {
  const config = getState().config;
  const chains = Object.keys(config.triggers.beaconUpdates);
  const providers = chains.reduce((acc: Providers, chainId: string) => {
    const chain = config.chains[chainId];

    // TODO: Should be later part of the validation
    if (!chain) {
      console.log(`Missing chain definition for chain with ID ${chainId} `);
      return acc;
    }

    const contractAddress = chain.contracts['DapiServer'];

    // TODO: Should be later part of the validation
    if (!contractAddress) {
      console.log(`Missing contract address for DapiServer on chain with ID ${chainId}`);
      return acc;
    }

    const chainProviders = Object.values(chain.providers).map((provider) =>
      initializeProvider(chainId, contractAddress, provider.url)
    );

    return { ...acc, [chainId]: chainProviders };
  }, {});

  updateState((state) => ({ ...state, providers }));
};
