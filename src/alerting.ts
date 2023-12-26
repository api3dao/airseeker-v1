import { TextEncoder } from 'util';
import { keccak256 } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';
import * as utils from '@api3/operations-utilities';
import * as Bnj from 'bignumber.js';
import axios from 'axios';
import { go } from '@api3/promise-utils';
import { TrimmedDApi } from '@prisma/client';
import { Api3ServerV1 } from '@api3/airnode-protocol-v1';
import { groupBy } from 'lodash';
import prisma from './database';
import { BeaconSetTrigger, BeaconTrigger } from './validation';
import { calculateUpdateInPercentage } from './calculations';
import { UpdateStatus } from './check-condition';
import { HUNDRED_PERCENT } from './constants';
import { getState } from './state';
import { RateLimitedProvider } from './providers';
import { logger } from './logging';

const RPC_PROVIDER_BAD_TRIES_AFTER_WHICH_CONSIDERED_DEAD = 3;
const GATEWAYS_BAD_TRIES_AFTER_WHICH_CONSIDERED_DEAD = 3;

export let prismaActive = prisma;

export const setPrisma = (newPrisma: any) => {
  prismaActive = newPrisma;
};

type DbRecord = {
  model: 'deviationValue' | 'rPCFailures' | 'compoundValues' | 'dataFeedApiValue' | 'gatewayFailures';
  record: any;
};
export let recordsToInsert: DbRecord[] = [];
let dbMutex = false;
let lastDbInsert = Date.now();
let dbWriterInterval: undefined | NodeJS.Timeout;

export const clearRecordsToInsert = () => {
  recordsToInsert = [];
};

export const getRecordsToInsert = () => recordsToInsert;

const addRecord = (record: DbRecord) => {
  // eslint-disable-next-line functional/immutable-data
  recordsToInsert.push(record);
};

const writeRecords = async () => {
  if (dbMutex) {
    return;
  }

  dbMutex = true;

  lastDbInsert = Date.now();

  const bufferedRecords = groupBy([...recordsToInsert], 'model');
  recordsToInsert = [];

  const results = (
    await Promise.allSettled(
      Object.entries(bufferedRecords).map(([model, data]) =>
        // @ts-ignore
        prismaActive[model].createMany({ data: data.map((item) => item.record) })
      )
    )
  ).filter((result) => result.status === 'rejected');

  if (results.length > 0) {
    logger.error(`DB Writer error: ${results}`);
  }

  dbMutex = false;

  if (getState().stopSignalReceived) {
    logger.info('Clearing DB writer interval due to stop signal received...');
    clearInterval(dbWriterInterval);
  }
};

/*
A big problem with the predecessor of this app was maintenance; having a separate application for datafeeds is a lot of
work.

To keep things low maintenance this branch tries to keep everything related to alerting very obviously separate from the
main Airseeker application. Only the entrypoint into the alerting code have been added to the non-alerting side of
the application.

The nature of the alerting code means immutability can't really apply, at least not like the rest of Airseeker.
 */

// A type representing data we retrieve from Source
export type SourceData = Record<string, { dataFeedId: string; value: number; timestamp: number; name: string }[]>;

export type SourcePayload = {
  success: boolean;
  result: SourceData;
};

// Mocking the OpsGenie utils for tests can be a pain - this assists us
let { limitedCloseOpsGenieAlertWithAlias, limitedSendToOpsGenieLowLevel } = utils.getOpsGenieLimiter({
  maxConcurrent: 5,
  minTime: 10,
});
export { limitedCloseOpsGenieAlertWithAlias, limitedSendToOpsGenieLowLevel };

export const opsGenieConfig = { apiKey: process.env.OPSGENIE_API_KEY ?? '', responders: [] };

/**
 * Retrieves Source data - this is data from various providers served by Source that allows us to have a baseline/reference
 * deviation.
 */
export const getSourceData = async (): Promise<SourceData> => {
  const sourceResponse = await go(
    () =>
      axios({
        url: process.env.NODARY_DATA_URL,
        method: 'GET',
        timeout: 10_000,
      }),
    { retries: 0, attemptTimeoutMs: 14_900, totalTimeoutMs: 15_000 }
  );

  if (!sourceResponse.success) {
    limitedSendToOpsGenieLowLevel(
      {
        message: 'Error retrieving off-chain values in Airseeker Monitoring',
        priority: 'P4',
        alias: 'api3-dataloader-index-retrieval-airseeker-monitoring',
        description: [`Error`, sourceResponse.error.message, sourceResponse.error.stack].join('\n'),
      },
      opsGenieConfig
    );
    throw new Error('Error retrieving off-chain values endpoint');
  }
  limitedCloseOpsGenieAlertWithAlias('api3-dataloader-index-retrieval-airseeker-monitoring', opsGenieConfig);

  const parsedResponse = sourceResponse.data.data as SourcePayload;

  return parsedResponse.result;
};

/* Mutable stuff */
let sourcePricingData: SourceData = {};
let trimmedDapis: TrimmedDApi[] = [];
const gatewayResults: Record<string, { badTries: number }> = {};
const rpcProviderResults: Record<string, { badTries: number }> = {};

/**
 * Handles response statuses from RPC Provider calls.
 *
 * If a Provider call fails more than 3-times in a row, this code raises an alert.
 *
 * Again, we try to not modify the original Airseeker code as far as possible, so we take arguments here that don't
 * entirely make sense... like the contract. The contract is what Airseeker uses to do its work, but really we're after
 * the RPC Provider inside the contract object.
 *
 * @param contract
 * @param success
 */
export const recordRpcProviderResponseSuccess = async (contract: Api3ServerV1, success: boolean) => {
  try {
    const state = getState();

    const provider = contract.provider as RateLimitedProvider;
    const selector = provider.connection.url;

    const existingResult = rpcProviderResults[selector] ?? { badTries: 0 };

    // eslint-disable-next-line functional/immutable-data
    const newResultStatus = (rpcProviderResults[selector] = {
      ...existingResult,
      badTries: success ? 0 : existingResult.badTries + 1,
    });

    const chainName = (Object.entries(state.config.chains).find(([_chainName, value]) =>
      Object.entries(value.providers).find(([_providerName, provider]) => provider.url === selector)
    ) ?? [''])[0];

    const chainConfig = state.config.chains[chainName];

    const providerName = Object.entries(chainConfig.providers).find(
      ([_providerName, provider]) => provider.url === selector
    )![0];

    if (newResultStatus.badTries > RPC_PROVIDER_BAD_TRIES_AFTER_WHICH_CONSIDERED_DEAD) {
      const providerCount = Object.values(chainConfig.providers).length;

      const deadProvidersForThisChain = Object.values(chainConfig.providers)
        .map((provider) => provider.url)
        .map((url) => rpcProviderResults[url]?.badTries ?? 0)
        .filter((badTries) => badTries > RPC_PROVIDER_BAD_TRIES_AFTER_WHICH_CONSIDERED_DEAD).length;

      limitedSendToOpsGenieLowLevel(
        {
          message: `Dead RPC URL detected for ${chainName}/'${providerName}'`,
          priority: 'P3',
          alias: `dead-rpc-url-${chainName}${generateOpsGenieAlias(selector)}`,
          description: [
            `An RPC URL has failed ${newResultStatus.badTries} times.`,
            `Airseeker usually has more than one provider per chain, for this chain it has ${providerCount}.`,
            `Currently this chain has ${deadProvidersForThisChain} dead RPC URL Providers.`,
            `If Airseeker doesn't have enough providers for a chain, it won't be able to do its job.`,
            `We usually include a premium provider and a public RPC provider in Airseeker. The Public provider is`,
            `more likely to be rate limited and arbitrarily fail.`,
          ].join('\n'),
        },
        opsGenieConfig
      );
    } else {
      limitedCloseOpsGenieAlertWithAlias(`dead-rpc-url-${chainName}${generateOpsGenieAlias(selector)}`, opsGenieConfig);
    }

    addRecord({
      model: 'rPCFailures',
      record: {
        chainName,
        hashedUrl: generateOpsGenieAlias(selector),
        providerName,
        count: newResultStatus.badTries,
      },
    });
  } catch (e) {
    const typedErr = e as Error;

    logger.warn(
      `Error while processing provider response success: ${JSON.stringify(
        { typedErr, stack: typedErr.stack },
        null,
        2
      )}`
    );
  }
};

export const getBaseUrl = (fullUrl: string) => {
  const url = new URL(fullUrl);

  return `${url.protocol}//${url.host}`;
};

const findGateway = (airnodeAddress: string, shortUrl: string) => {
  const baseUrl = getBaseUrl(shortUrl);
  const selector = `${airnodeAddress}-${baseUrl}`;

  return (Object.entries(gatewayResults).find(([key]) => key.includes(selector)) ?? [undefined, undefined])[1];
};

/**
 * This function is built to make it easy to record gateway response success/failures from the makeSignedDataGatewayRequests function.
 *
 * It keeps count of the number of failure for each gateway, resetting the number to zero for every success.
 * If the count exceeds '3' (maybe this should be configurable in future), an OpsGenie alert is generated.
 *
 * @param templateId
 * @param gatewayUrl
 * @param success
 */
export const recordGatewayResponseSuccess = async (templateId: string, gatewayUrl: string, success: boolean) => {
  const state = getState();
  const affectedBeacons = Object.entries(state?.config?.beacons ?? {}).filter(
    ([_beaconId, beacon]) => beacon.templateId === templateId
  );

  if (affectedBeacons.length === 0) {
    logger.error('Unable to record gateway response as no affected beacons found.');
    return;
  }

  const airnodeAddress = affectedBeacons[0][1].airnode;

  const selector = `${airnodeAddress}-${gatewayUrl}`;

  const existingGatewayResult = gatewayResults[selector] ?? { badTries: 0 };

  // eslint-disable-next-line functional/immutable-data
  const newGatewayResultStatus = (gatewayResults[selector] = {
    ...existingGatewayResult,
    badTries: success ? 0 : existingGatewayResult.badTries + 1,
  });

  const baseUrl = getBaseUrl(gatewayUrl);

  const allGateways = state.config.gateways[airnodeAddress];
  const allGatewaysCount = allGateways.length;

  const deadGateways = allGateways
    .map((gateway) => findGateway(airnodeAddress, gateway.url)?.badTries ?? 0)
    .filter((badTries) => badTries > GATEWAYS_BAD_TRIES_AFTER_WHICH_CONSIDERED_DEAD).length;

  if (newGatewayResultStatus.badTries > GATEWAYS_BAD_TRIES_AFTER_WHICH_CONSIDERED_DEAD) {
    limitedSendToOpsGenieLowLevel(
      {
        message: `Dead gateway for Airnode Address ${airnodeAddress}`,
        priority: 'P3',
        alias: `dead-gateway-${airnodeAddress}${generateOpsGenieAlias(baseUrl)}`,
        description: [
          `A gateway has failed at least ${newGatewayResultStatus.badTries} times.`,
          `If the provider doesn't have enough active gateways Airseeker won't be able to get values with which to update the beacon set.`,
          `The beaconset can still be updated if a majority of feeds are available, but this isn't ideal.`,
          `The hashed URL is included below.`,
          `The Airseeker has ${allGatewaysCount} gateways for this API provider, of which ${deadGateways} are currently dead.`,
          ``,
          `Airnode Address: ${airnodeAddress}`,
          `Hashed Gateway URL: ${generateOpsGenieAlias(baseUrl)}`,
          `Generated as follows: keccak256(new TextEncoder().encode('https://gateway-url.com'));`,
          baseUrl.includes('amazonaws')
            ? 'The URL is an AWS URL.'
            : baseUrl.includes('gateway.dev')
            ? 'The URL is a GCP URL.'
            : '',
          `and it affects the following beacon(s):`,
          ...affectedBeacons.map(([beaconId]) => beaconId),
        ].join('\n'),
      },
      opsGenieConfig
    );
  } else {
    limitedCloseOpsGenieAlertWithAlias(
      `dead-gateway-${airnodeAddress}${generateOpsGenieAlias(baseUrl)}`,
      opsGenieConfig
    );
  }

  addRecord({
    model: 'gatewayFailures',
    record: {
      airnodeAddress: airnodeAddress,
      hashedUrl: generateOpsGenieAlias(gatewayUrl),
      count: newGatewayResultStatus.badTries,
    },
  });
};

const dbTrimmedDapisUpdater = async () => {
  try {
    trimmedDapis = await prismaActive.trimmedDApi.findMany();

    limitedCloseOpsGenieAlertWithAlias('trimmed-dapis-retrieval-airseeker-monitoring-reporter-loop', opsGenieConfig);
  } catch (e) {
    logger.warn(`Error while grabbing trimmed dAPIs: ${JSON.stringify(e, null, 2)}`);

    const errTyped = e as Error;

    limitedSendToOpsGenieLowLevel(
      {
        message: 'Error retrieving Trimmed dAPIs in Airseeker Monitoring',
        priority: 'P3',
        alias: 'trimmed-dapis-retrieval-airseeker-monitoring-reporter-loop',
        description: [
          `This failure will impact Airseeker's ability to assign names to records and also it's ability to check`,
          `Source values against beaconSet values.`,
          `Monitoring will therefore be impacted while this alert is open.`,
          ``,
          `Error`,
          errTyped.message,
          errTyped.stack,
        ].join('\n'),
      },
      opsGenieConfig
    );
  }
};

const sourceUpdater = async () => {
  try {
    const sourceData = await getSourceData();
    if (sourceData) {
      sourcePricingData = sourceData;
    }
    limitedCloseOpsGenieAlertWithAlias('provider-data-retrieval-airseeker-monitoring', opsGenieConfig);
  } catch (e) {
    logger.warn(`Error while retrieving data from Source: ${JSON.stringify(e, null, 2)}`);

    const errTyped = e as Error;

    limitedSendToOpsGenieLowLevel(
      {
        message: 'Error retrieving provider data in Airseeker Monitoring',
        priority: 'P3',
        alias: 'provider-data-retrieval-airseeker-monitoring',
        description: [
          `This failure will impact Airseeker's ability to assign names to records and also it's ability to check`,
          `APIprovider values against beaconSet values.`,
          `Monitoring will therefore be impacted while this alert is open.`,
          ``,
          `Error`,
          errTyped.message,
          errTyped.stack,
        ].join('\n'),
      },
      opsGenieConfig
    );
  }
};

let intervalsConfigured = false;

export const configureIntervals = async () => {
  if (intervalsConfigured) {
    return;
  }

  intervalsConfigured = true;

  dbTrimmedDapisUpdater();
  sourceUpdater();

  setInterval(sourceUpdater, 30_000);
  setInterval(writeRecords, 10_000);
  setInterval(dbTrimmedDapisUpdater, 120_000);

  if (process.env.DEBUG_DB_WRITER) {
    setInterval(() => {
      logger.log(`DB writer queue size: ${recordsToInsert.length} | ${(Date.now() - lastDbInsert) / 1_000}`);
    }, 2_000);
  }
};

export const setOpsGenieHandlers = (
  newLimitedCloseOpsGenieAlertWithAlias: any,
  newLimitedSendToOpsGenieLowLevel: any
) => {
  limitedCloseOpsGenieAlertWithAlias = newLimitedCloseOpsGenieAlertWithAlias;
  limitedSendToOpsGenieLowLevel = newLimitedSendToOpsGenieLowLevel;
};

export const generateOpsGenieAlias = (description: string) => keccak256(new TextEncoder().encode(description));

export const prettyFormatObject = (source: any) =>
  Object.entries(source)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');

const pad = (input: number) => {
  if (input < 10) {
    return `0${input}`;
  }

  return input.toString();
};

export const prettyDuration = (sec_num: number) => {
  if (sec_num < 0 || sec_num > 48 * 60 * 60) {
    return sec_num;
  }

  const hours = Math.floor(sec_num / 3600);
  const minutes = Math.floor((sec_num - hours * 3600) / 60);
  const seconds = sec_num - hours * 3600 - minutes * 60;

  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
};

export const getChainName = (chainId?: string) => DB_CHAINS.find((chain) => chain.id === chainId)?.name ?? 'None';

export const checkAndReport = async (
  type: 'Beacon' | 'BeaconSet',
  dataFeedId: string,
  onChainValue: BigNumber,
  onChainTimestamp: number,
  offChainValue: BigNumber,
  offChainTimestamp: number,
  chainId: string,
  trigger: Pick<BeaconTrigger | BeaconSetTrigger, 'deviationThreshold' | 'heartbeatInterval'>,
  deviationAlertMultiplier = 2,
  heartbeatMultiplier = 1.1
) => {
  configureIntervals();

  if (type === 'Beacon') {
    return;
  }
  const reportedDeviation = new Bnj.BigNumber(calculateUpdateInPercentage(onChainValue, offChainValue).toString())
    .div(new Bnj.BigNumber(HUNDRED_PERCENT))
    .multipliedBy(new Bnj.BigNumber(100))
    .toNumber();

  const thisDapi = trimmedDapis.find((dapi) => dapi.dataFeedId === dataFeedId);
  const chainName = getChainName(chainId);

  const normaliseChainToNumber = (input: BigNumber): number => {
    const inputAsBn = new Bnj.BigNumber(input.toString());

    return inputAsBn.dividedBy(new Bnj.BigNumber(10).pow(new Bnj.BigNumber(18))).toNumber();
  };

  const dapiName = trimmedDapis.find((dapi) => dapi.dataFeedId === dataFeedId)?.name ?? 'Unknown Name';

  // may not have been loaded yet or may not exist for some reason 🤷
  if (thisDapi && sourcePricingData['nodary']) {
    const onChainValueNumber = normaliseChainToNumber(onChainValue);

    const sourceBaseline = sourcePricingData['nodary'].find(
      (feed) => feed.name.toLowerCase() === thisDapi.name.toLowerCase()
    );
    const nodaryDeviation = sourceBaseline?.value
      ? Math.abs(sourceBaseline.value / onChainValueNumber - 1) * 100.0
      : -1;

    addRecord({
      model: 'compoundValues',
      record: {
        dapiName: thisDapi.name,
        dataFeedId,
        chainName,
        onChainValue: onChainValueNumber,
        offChainValue: normaliseChainToNumber(offChainValue),
        onOffChainDeviation: reportedDeviation,
        nodaryDeviation,
        nodaryValue: sourceBaseline?.value ?? -1,
        onChainTimestamp: new Date(onChainTimestamp * 1_000),
        timestampDelta: Date.now() - onChainTimestamp * 1_000,
      },
    });

    if (nodaryDeviation === -1) {
      const description = prettyFormatObject({
        type,
        onChainValue: onChainValue.toString(),
        offChainValue: offChainValue.toString(),
        onChainTimestamp: new Date(onChainTimestamp * 1_000).toUTCString(),
        offChainTimestamp: new Date(offChainTimestamp * 1_000).toUTCString(),
        alertDeviationThreshold: `${trigger.deviationThreshold} %`,
        currentDeviation: `${nodaryDeviation} %`,
        heartbeatInterval: trigger.heartbeatInterval,
        dataFeedId,
        dapiName,
        chainId,
      });

      limitedSendToOpsGenieLowLevel(
        {
          priority: 'P2',
          alias: `missing-api-reference-${dataFeedId}${chainId}`,
          message: `Missing Value | ${dataFeedId} on chain ${chainId}`, //`${UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE} for ${type} with ${dataFeedId} on chain ${chainId}`,
          description: [
            `We are missing a value for this datafeed from the reference data provider.`,
            `This is not critical, but not great either as we don't have a "shadow" reference.`,
            '',
            description,
          ].join('\n'),
        },
        opsGenieConfig
      );
    } else {
      limitedCloseOpsGenieAlertWithAlias(`missing-api-reference-${dataFeedId}${chainId}`, opsGenieConfig);
    }

    // We have the nodary deviation, so we can now do a shadow alert check too
    const alertDeviationThreshold = trigger.deviationThreshold * deviationAlertMultiplier;
    if (nodaryDeviation > -1 && nodaryDeviation > alertDeviationThreshold) {
      const description = prettyFormatObject({
        type,
        onChainValue: onChainValue.toString(),
        offChainValue: offChainValue.toString(),
        onChainTimestamp: new Date(onChainTimestamp * 1_000).toUTCString(),
        offChainTimestamp: new Date(offChainTimestamp * 1_000).toUTCString(),
        alertDeviationThreshold: `${trigger.deviationThreshold} %`,
        currentDeviation: `${nodaryDeviation} %`,
        heartbeatInterval: trigger.heartbeatInterval,
        dataFeedId,
        dapiName,
        chainId,
        sourceBaseline: sourceBaseline?.value ?? -1,
      });

      limitedSendToOpsGenieLowLevel(
        {
          priority: 'P2',
          alias: generateOpsGenieAlias(
            `${UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE}-source-${dataFeedId}${chainId}`
          ),
          message: `Shadow alert deviation exceeded | ${dataFeedId} on chain ${chainId}`, //`${UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE} for ${type} with ${dataFeedId} on chain ${chainId}`,
          description: [
            'The deviation between what Source is reporting for an asset and what we have on chain is beyond the alert threshold.',
            'Either Source is wrong or our feed is wrong. More data follows:',
            '',
            description,
          ].join('\n'),
        },
        opsGenieConfig
      );
    } else {
      limitedCloseOpsGenieAlertWithAlias(
        generateOpsGenieAlias(`${UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE}-source-${dataFeedId}${chainId}`),
        opsGenieConfig
      );
    }
  }

  addRecord({
    model: 'dataFeedApiValue',
    record: {
      dataFeedId,
      apiValue: new Bnj.BigNumber(offChainValue.toString())
        .dividedBy(new Bnj.BigNumber(10).pow(new Bnj.BigNumber(18)))
        .toNumber(),
      timestamp: new Date(offChainTimestamp * 1_000),
      fromNodary: false,
    },
  });

  if (reportedDeviation !== 0) {
    addRecord({
      model: 'deviationValue',
      record: {
        dataFeedId,
        deviation: reportedDeviation,
        chainName,
      },
    });
  }

  const currentDeviation = new Bnj.BigNumber(calculateUpdateInPercentage(onChainValue, offChainValue).toString())
    .div(new Bnj.BigNumber(HUNDRED_PERCENT))
    .multipliedBy(new Bnj.BigNumber(100))
    .toNumber();
  const alertDeviationThreshold = trigger.deviationThreshold * deviationAlertMultiplier;

  const tsDeltaAbs = Math.abs(offChainTimestamp - onChainTimestamp);

  const description = prettyFormatObject({
    type,
    onChainValue: onChainValue.toString(),
    offChainValue: offChainValue.toString(),
    onChainTimestamp: new Date(onChainTimestamp * 1_000).toUTCString(),
    offChainTimestamp: new Date(offChainTimestamp * 1_000).toUTCString(),
    timestampDelta: prettyDuration(tsDeltaAbs),
    alertDeviationThreshold: `${trigger.deviationThreshold} %`,
    currentDeviation: `${currentDeviation} %`,
    heartbeatInterval: trigger.heartbeatInterval,
    dataFeedId,
    dapiName,
    chainId,
  });

  const deviationExceeded = currentDeviation > alertDeviationThreshold;
  const tsHeartbeatExceeded = tsDeltaAbs > (trigger.heartbeatInterval ?? 86400) * heartbeatMultiplier;

  if (deviationExceeded) {
    await Promise.allSettled([
      limitedSendToOpsGenieLowLevel(
        {
          priority: 'P3',
          alias: generateOpsGenieAlias(`${UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE}${dataFeedId}${chainId}`),
          message: `${UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE} for ${type} with ${dataFeedId} on chain ${chainId}`,
          description,
        },
        opsGenieConfig
      ),
    ]);
  } else {
    await Promise.allSettled([
      limitedCloseOpsGenieAlertWithAlias(
        generateOpsGenieAlias(`${UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE}${dataFeedId}${chainId}`),
        opsGenieConfig
      ),
    ]);
  }

  if (tsHeartbeatExceeded) {
    await Promise.allSettled([
      limitedSendToOpsGenieLowLevel(
        {
          priority: 'P3',
          alias: generateOpsGenieAlias(
            `${UpdateStatus.ON_CHAIN_TIMESTAMP_OLDER_THAN_HEARTBEAT_MESSAGE}${dataFeedId}${chainId}`
          ),
          message: `${UpdateStatus.ON_CHAIN_TIMESTAMP_OLDER_THAN_HEARTBEAT_MESSAGE} for ${type} with ${dataFeedId} on chain ${chainId}`,
          description,
        },
        opsGenieConfig
      ),
    ]);
  } else {
    await Promise.allSettled([
      limitedCloseOpsGenieAlertWithAlias(
        generateOpsGenieAlias(`${UpdateStatus.ON_CHAIN_TIMESTAMP_OLDER_THAN_HEARTBEAT_MESSAGE}${dataFeedId}${chainId}`),
        opsGenieConfig
      ),
    ]);
  }
};

// TODO this needs to come out of the DB or some other static resource
export const DB_CHAINS = [
  {
    id: '1101',
    name: 'polygon-zkevm',
  },
  {
    id: '137',
    name: 'polygon',
  },
  {
    id: '1285',
    name: 'moonriver',
  },
  {
    id: '59140',
    name: 'linea-goerli-testnet',
  },
  {
    id: '200101',
    name: 'milkomeda-c1-testnet',
  },
  {
    id: '4002',
    name: 'fantom-testnet',
  },
  {
    id: '10200',
    name: 'gnosis-testnet',
  },
  {
    id: '421613',
    name: 'arbitrum-goerli-testnet',
  },
  {
    id: '30',
    name: 'rsk',
  },
  {
    id: '56',
    name: 'bsc',
  },
  {
    id: '59144',
    name: 'linea',
  },
  {
    id: '8453',
    name: 'base',
  },
  {
    id: '324',
    name: 'zksync',
  },
  {
    id: '5001',
    name: 'mantle-goerli-testnet',
  },
  {
    id: '1287',
    name: 'moonbeam-testnet',
  },
  {
    id: '534353',
    name: 'scroll-goerli-testnet',
  },
  {
    id: '5',
    name: 'goerli',
  },
  {
    id: '42161',
    name: 'arbitrum',
  },
  {
    id: '250',
    name: 'fantom',
  },
  {
    id: '2222',
    name: 'kava',
  },
  {
    id: '5000',
    name: 'mantle',
  },
  {
    id: '84531',
    name: 'base-goerli-testnet',
  },
  {
    id: '420',
    name: 'optimism-goerli-testnet',
  },
  {
    id: '10',
    name: 'optimism',
  },
  {
    id: '2221',
    name: 'kava-testnet',
  },
  {
    id: '338',
    name: 'cronos-testnet',
  },
  {
    id: '1442',
    name: 'polygon-zkevm-testnet',
  },
  {
    id: '1',
    name: 'mainnet',
  },
  {
    id: '1284',
    name: 'moonbeam',
  },
  {
    id: '100',
    name: 'gnosis',
  },
  {
    id: '43114',
    name: 'avalanche',
  },
  {
    id: '1088',
    name: 'metis',
  },
  {
    id: '280',
    name: 'zksync-goerli-testnet',
  },
  {
    id: '97',
    name: 'bsc-testnet',
  },
  {
    id: '599',
    name: 'metis-testnet',
  },
  {
    id: '31',
    name: 'rsk-testnet',
  },
  {
    id: '42170',
    name: 'arbitrum-nova',
  },
  {
    id: '2001',
    name: 'milkomeda-c1',
  },
  {
    id: '43113',
    name: 'avalanche-testnet',
  },
  {
    id: '11155111',
    name: 'sepolia',
  },
  {
    id: '80001',
    name: 'polygon-testnet',
  },
];
