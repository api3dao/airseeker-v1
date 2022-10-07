import { join } from 'path';
import { AirnodeRrpAddresses } from '@api3/airnode-protocol';
import prompts, { PromptObject, Choice } from 'prompts';
import { Api, Beacon, OperationsRepository, BeaconSet } from '@api3/operations/dist/types';
import { readOperationsRepository } from '@api3/operations/dist/utils/read-operations';
import { runAndHandleErrors, writeJsonFile } from './utils';
import { Beacons, BeaconSets, Gateways, Templates, Triggers } from '../src/validation';
import { sanitiseFilename } from './utils';
import { getFormattedUtcTimestamp } from './utils';

const questions = (beaconChoices: Choice[], beaconSetChoices: Choice[]): PromptObject[] => {
  return [
    {
      type: 'text',
      name: 'name',
      message: 'What is the Airseeker configuration name?',
      initial: getFormattedUtcTimestamp(),
    },
    {
      type: 'autocompleteMultiselect',
      name: 'selectedBeacons',
      message: 'What are the beacons you want to include in the configuration?',
      choices: beaconChoices,
    },
    {
      type: 'autocompleteMultiselect',
      name: 'selectedBeaconSets',
      message: 'What are the beacons sets you want to include in the configuration?',
      choices: beaconSetChoices,
    },
    {
      type: 'number',
      name: 'numberOfProviders',
      message: 'How many RPC provider (per chain) you want to use in the configuration?',
      validate: (value) => (value < 0 ? 'Non-negative values are not allowed!' : true),
    },
  ];
};

const main = async (operationRepositoryTarget?: string) => {
  const operationsRepository = readOperationsRepository(operationRepositoryTarget);

  const beaconChoices = Object.values(operationsRepository.apis).flatMap((api) =>
    Object.values(api.beacons).map((beacon) => ({
      title: `${api.apiMetadata.name}\t${beacon.name}`,
      value: { api: api, beacon: beacon },
      selected: true,
    }))
  );

  const beaconSetChoices = Object.values(operationsRepository.beaconSets).flatMap((beaconSet) => ({
    title: `${beaconSet.name}`,
    value: beaconSet,
    selected: true,
  }));

  const response = await prompts(questions(beaconChoices, beaconSetChoices), {
    onCancel: () => {
      throw new Error('Aborted by the user');
    },
  });
  const selectedBeacons = response.selectedBeacons as { api: Api; beacon: Beacon }[];
  const selectedBeaconSets = response.selectedBeaconSets as BeaconSet[];
  const beacons = selectedBeacons.map((beacon) => beacon.beacon);
  const apis = selectedBeacons
    .map((beacon) => beacon.api)
    .filter((api, index, apis) => apis.findIndex((find) => find.apiMetadata.name === api.apiMetadata.name) === index);

  // Get all the chains the airseeker configuration will be deployed on
  const beaconChains = [...new Set(Object.values(beacons).flatMap((beacon) => Object.keys(beacon.chains)))];
  const beaconSetChains = [
    ...new Set(Object.values(selectedBeaconSets).flatMap((beaconSet) => Object.keys(beaconSet.chains))),
  ];
  const combinedChains = [...beaconChains, ...beaconSetChains].filter(
    (item, pos, array) => array.indexOf(item) === pos
  );

  //// Build airseeker.json ////

  const cloudProviderType = 'aws';

  const airseekerLogs = {
    format: 'plain',
    level: 'INFO',
  };

  const airseekerBeacons = beacons.reduce(
    (beaconObj, beacon) => ({
      ...beaconObj,
      [beacon.beaconId]: {
        airnode: beacon.airnodeAddress,
        templateId: beacon.templateId,
        fetchInterval: Math.ceil(
          Math.min(
            ...Object.values(beacon.chains)
              .filter((chain) => 'airseekerConfig' in chain)
              .map((chain) => chain.airseekerConfig!.updateInterval)
          ) / 2
        ),
      },
    }),
    {} as Beacons
  );

  const airseekerBeaconSet = selectedBeaconSets.reduce(
    (beaconSetObj, beaconSet) => ({
      ...beaconSetObj,
      [beaconSet.beaconSetId]: beaconSet.beaconIds,
    }),
    {} as BeaconSets
  );

  const airseekerChains = combinedChains
    .map((chainName) => {
      const chainId = parseInt(operationsRepository.chains[chainName].id);
      return {
        [`${chainId}`]: {
          contracts: {
            AirnodeRrp: AirnodeRrpAddresses[chainId] || '',
            DapiServer: operationsRepository.chains[chainName].contracts.DapiServer || '',
          },
          providers: Array.from({ length: response.numberOfProviders }, (_, index) => ({
            [`provider_${sanitiseFilename(chainName).replace(/\-/g, '_')}_${index + 1}`]: {
              url: `\${RPC_PROVIDER_${sanitiseFilename(chainName).replace(/\-/g, '_')}_${index + 1}}`.toUpperCase(),
            },
          })).reduce((r, c) => Object.assign(r, c), {}),
          options: {
            txType: 'eip1559' as const,
            priorityFee: {
              value: 3.12,
              unit: 'gwei' as const,
            },
            baseFeeMultiplier: 2,
            fulfillmentGasLimit: 500000,
          },
        },
      };
    })
    .reduce((chainsObject, chain) => ({ ...chainsObject, ...chain }), {});

  const airseekerGateways = apis.reduce(
    (gatewaysObject, api) => ({
      ...gatewaysObject,
      [api.apiMetadata.airnode]: [
        ...(gatewaysObject?.[api.apiMetadata.airnode] || []),
        {
          apiKey: `\${HTTP_SIGNED_DATA_GATEWAY_KEY_${sanitiseFilename(
            api.apiMetadata.name
          ).toUpperCase()}_${cloudProviderType.toUpperCase()}}`,
          url: `\${HTTP_SIGNED_DATA_GATEWAY_URL_${sanitiseFilename(
            api.apiMetadata.name
          ).toUpperCase()}_${cloudProviderType.toUpperCase()}}`,
        },
      ],
    }),
    {} as Gateways
  );

  const aiseekerTemplates = apis
    .map((api) =>
      Object.values(api.templates).reduce(
        (templateObj, template) => ({
          ...templateObj,
          [template.templateId]: {
            endpointId: template.endpointId,
            parameters: template.parameters,
          },
        }),
        {} as Templates
      )
    )
    .reduce((templatesObject, template) => ({ ...templatesObject, ...template }), {});

  const airseekerBeaconTriggers = beacons.reduce(
    (curr1, beacon) =>
      Object.entries(beacon.chains)
        .filter(([, chain]) => 'airseekerConfig' in chain)
        .reduce((curr2, [chainName, chain]) => {
          const chainId = parseInt(operationsRepository.chains[chainName].id);
          return {
            ...curr2,
            dataFeedUpdates: {
              ...curr2.dataFeedUpdates,
              [`${chainId}`]: {
                ...curr2?.dataFeedUpdates?.[`${chainId}`],
                [chain.sponsor]: {
                  beacons: [
                    ...(curr2?.dataFeedUpdates?.[`${chainId}`]?.[chain.sponsor]?.beacons || []),
                    {
                      beaconId: beacon.beaconId,
                      deviationThreshold: chain.airseekerConfig!.deviationThreshold,
                      heartbeatInterval: chain.airseekerConfig!.heartbeatInterval,
                    },
                  ],
                  beaconSets: [],
                  updateInterval: chain.airseekerConfig!.updateInterval,
                },
              },
            },
          };
        }, curr1),
    {} as Triggers
  );

  const airseekerTriggers = selectedBeaconSets.reduce(
    (curr1, beaconSet) =>
      Object.entries(beaconSet.chains)
        .filter(([, chain]) => 'airseekerConfig' in chain)
        .reduce((curr2, [chainName, chain]) => {
          const chainId = parseInt(operationsRepository.chains[chainName].id);
          return {
            ...curr2,
            dataFeedUpdates: {
              ...curr2.dataFeedUpdates,
              [`${chainId}`]: {
                ...curr2?.dataFeedUpdates?.[`${chainId}`],
                [chain.sponsor]: {
                  beacons: [...(curr2?.dataFeedUpdates?.[`${chainId}`]?.[chain.sponsor]?.beacons || [])],
                  beaconSets: [
                    ...(curr2?.dataFeedUpdates?.[`${chainId}`]?.[chain.sponsor]?.beaconSets || []),
                    {
                      beaconSetId: beaconSet.beaconSetId,
                      deviationThreshold: chain.airseekerConfig!.deviationThreshold,
                      heartbeatInterval: chain.airseekerConfig!.heartbeatInterval,
                    },
                  ],
                  updateInterval: chain.airseekerConfig!.updateInterval,
                },
              },
            },
            beaconSetUpdates: {},
          };
        }, curr1),
    airseekerBeaconTriggers as Triggers
  );

  const airseeker = {
    airseekerWalletMnemonic: '${AIRSEEKER_WALLET_MNEMONIC}',
    log: airseekerLogs,
    beacons: airseekerBeacons,
    beaconSets: airseekerBeaconSet,
    chains: airseekerChains,
    gateways: airseekerGateways,
    templates: aiseekerTemplates,
    triggers: airseekerTriggers,
  };

  //// Build secrets.env ////

  const gatewaySecrets = apis.flatMap((api) => [
    `HTTP_SIGNED_DATA_GATEWAY_KEY_${sanitiseFilename(
      api.apiMetadata.name
    ).toUpperCase()}_${cloudProviderType.toUpperCase()}=`,
    `HTTP_SIGNED_DATA_GATEWAY_URL_${sanitiseFilename(
      api.apiMetadata.name
    ).toUpperCase()}_${cloudProviderType.toUpperCase()}=`,
  ]);

  const secretsArray = [
    ...gatewaySecrets,
    `AIRSEEKER_WALLET_MNEMONIC=`,
    ...combinedChains
      .map((chainName) =>
        Array.from({ length: response.numberOfProviders }, (_, index) =>
          `RPC_PROVIDER_${sanitiseFilename(chainName).replace(/\-/g, '_')}_${index + 1}=`.toUpperCase()
        )
      )
      .flat(),
  ];

  const secrets = {
    filename: '.env',
    content: secretsArray.join('\n'),
  };

  //// Create the deployment directory ////
  const updatedOpsData: OperationsRepository = {
    ...operationsRepository,
    api3: {
      ...operationsRepository.api3,
      airseeker: {
        ...operationsRepository.api3?.airseeker,
        [response.name]: {
          airseeker,
          secrets,
        },
      },
    },
  };

  writeJsonFile(join(__dirname, '..', 'config', 'airseeker.json'), airseeker);
  writeJsonFile(join(__dirname, '..', 'config', 'secrets'), secrets);
};

if (require.main === module) runAndHandleErrors(main);
