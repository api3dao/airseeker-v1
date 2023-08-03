import { TextEncoder } from 'util';
import { keccak256 } from 'ethers/lib/utils';
import { BigNumber } from 'ethers';
import * as utils from '@api3/operations-utilities';
import * as Bnj from 'bignumber.js';
import axios from 'axios';
import { go } from '@api3/promise-utils';
import { TrimmedDApi } from '@prisma/client';
import prisma from './database';
import { BeaconSetTrigger, BeaconTrigger } from './validation';
import { calculateUpdateInPercentage } from './calculations';
import { UpdateStatus } from './check-condition';
import { HUNDRED_PERCENT } from './constants';
import { sleep } from './utils';

export type NodaryData = Record<string, { dataFeedId: string; value: number; timestamp: number; name: string }[]>;

export type NodaryPayload = {
  success: boolean;
  result: NodaryData;
};

export type NodaryProviders = Record<string, string[]>;

export type NodaryProvidersPayload = {
  success: boolean;
  result: NodaryProviders;
};

export const getNodaryData = async (): Promise<NodaryData> => {
  const nodaryResponse = await go(
    () =>
      axios({
        url: process.env.NODARY_DATA_URL,
        method: 'GET',
      }),
    { retries: 0, attemptTimeoutMs: 14_900, totalTimeoutMs: 15_000 }
  );
  if (!nodaryResponse.success) {
    // await sendToOpsGenieLowLevel(
    //   {
    //     message: 'Error retrieving Nodary off-chain values endpoint',
    //     priority: 'P2',
    //     alias: 'api3-nodaryloader-index-retrieval',
    //     description: [`Error`, nodaryResponse.error.message, nodaryResponse.error.stack].join('\n'),
    //   },
    // );
    throw new Error('Error retrieving Nodary off-chain values endpoint');
  }
  // await closeOpsGenieAlertWithAlias('api3-nodaryloader-index-retrieval', {});

  if (nodaryResponse.data.status !== 200) {
    // await sendToOpsGenieLowLevel(
    //   {
    //     message: 'Error retrieving Nodary Data',
    //     priority: 'P2',
    //     alias: 'api3-nodary-loader-index-retrieval-status',
    //     description: `Error: status code not 200: ${nodaryResponse.data.statusText}`,
    //   },
    //   {},
    // );
    throw new Error('Error retrieving Nodary Data');
  }
  // await closeOpsGenieAlertWithAlias('api3-nodary-loader-index-retrieval-status', {});

  const parsedResponse = nodaryResponse.data.data as NodaryPayload;

  return parsedResponse.result;
};

let reporterRunning = false;
let nodaryPricingData: NodaryData = {};
let trimmedDapis: TrimmedDApi[] = [];

export const runReporterLoop = async () => {
  reporterRunning = true;
  let lastRun = 0;

  try {
    trimmedDapis = await prisma.trimmedDApi.findMany();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }

  while (reporterRunning) {
    if (Date.now() - lastRun > 60_000) {
      lastRun = Date.now();

      try {
        const nodaryData = await getNodaryData();
        if (nodaryData) {
          nodaryPricingData = nodaryData;
        }
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
      }
    }
    await sleep(1_000);
  }
};

export const opsGenieConfig = { responders: [], apiKey: process.env.OPSGENIE_API_KEY ?? '' };
let { limitedCloseOpsGenieAlertWithAlias, limitedSendToOpsGenieLowLevel } = utils.getOpsGenieLimiter();
export { limitedCloseOpsGenieAlertWithAlias, limitedSendToOpsGenieLowLevel };

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
  if (!reporterRunning) {
    runReporterLoop();
  }

  if (type === 'Beacon') {
    return;
  }
  const reportedDeviation = new Bnj.BigNumber(calculateUpdateInPercentage(onChainValue, offChainValue).toString())
    .div(new Bnj.BigNumber(HUNDRED_PERCENT))
    .multipliedBy(new Bnj.BigNumber(100))
    .toNumber();

  const thisDapi = trimmedDapis.find((dapi) => dapi.dataFeedId === dataFeedId);
  const chain = getChainName(chainId);

  const normaliseChainToNumber = (input: BigNumber): number => {
    const inputAsBn = new Bnj.BigNumber(input.toString());

    return inputAsBn.dividedBy(new Bnj.BigNumber(10).pow(new Bnj.BigNumber(18))).toNumber();
  };

  // may not have been loaded yet or may not exist for some reason 🤷
  if (thisDapi && nodaryPricingData['nodary']) {
    const onChainValueNumber = normaliseChainToNumber(onChainValue);

    const nodaryBaseline = nodaryPricingData['nodary'].find(
      (feed) => feed.name.toLowerCase() === thisDapi.name.toLowerCase()
    );
    const nodaryDeviation = nodaryBaseline ? Math.abs(nodaryBaseline.value / onChainValueNumber - 1) * 100.0 : -1;

    await prisma.compoundValues.create({
      data: {
        dapiName: thisDapi.name,
        dataFeedId,
        chain,
        onChainValue: onChainValueNumber,
        offChainValue: normaliseChainToNumber(offChainValue),
        onOffChainDeviation: reportedDeviation,
        nodaryDeviation,
        nodaryValue: nodaryBaseline?.value ?? 0,
        onChainTimestamp: new Date(onChainTimestamp * 1_000),
        timestampDelta: Date.now() - onChainTimestamp * 1_000,
      },
    });
  }

  const prismaPromises = await Promise.allSettled([
    prisma.dataFeedApiValue.create({
      data: {
        dataFeedId,
        apiValue: new Bnj.BigNumber(offChainValue.toString())
          .dividedBy(new Bnj.BigNumber(10).pow(new Bnj.BigNumber(18)))
          .toNumber(),
        timestamp: new Date(offChainTimestamp * 1_000),
        fromNodary: false,
      },
    }),
    reportedDeviation !== 0
      ? prisma.deviationValue.create({
          data: {
            dataFeedId,
            deviation: reportedDeviation,
            chainId,
          },
        })
      : undefined,
  ]);
  await Promise.allSettled(
    prismaPromises
      .filter((result) => result.status === 'rejected')
      .map((failedPromise) =>
        limitedSendToOpsGenieLowLevel(
          {
            priority: 'P2',
            alias: generateOpsGenieAlias(`error-insert-record-airseeker-logger`),
            message: `A Prisma error occurred while inserting a record in the Airseeker logger`,
            description: JSON.stringify(failedPromise, null, 2),
          },
          opsGenieConfig
        )
      )
  );

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

export const DB_CHAINS = [
  {
    id: '5001',
    name: 'mantle-goerli-testnet',
  },
  {
    id: '338',
    name: 'cronos-testnet',
  },
  {
    id: '2221',
    name: 'kava-testnet',
  },
  {
    id: '59140',
    name: 'linea-goerli-testnet',
  },
  {
    id: '1101',
    name: 'polygon-zkevm',
  },
  {
    id: '250',
    name: 'fantom',
  },
  {
    id: '534353',
    name: 'scroll-goerli-testnet',
  },
  {
    id: '84531',
    name: 'base-goerli-testnet',
  },
  {
    id: '43114',
    name: 'avalanche',
  },
  {
    id: '56',
    name: 'bsc',
  },
  {
    id: '42161',
    name: 'arbitrum',
  },
  {
    id: '10',
    name: 'optimism',
  },
  {
    id: '1284',
    name: 'moonbeam',
  },
  {
    id: '324',
    name: 'zksync',
  },
  {
    id: '137',
    name: 'polygon',
  },
  {
    id: '1',
    name: 'mainnet',
  },
  {
    id: '1285',
    name: 'moonriver',
  },
  {
    id: '100',
    name: 'gnosis',
  },
  {
    id: '1088',
    name: 'metis',
  },
  {
    id: '97',
    name: 'bsc-testnet',
  },
  {
    id: '280',
    name: 'zksync-goerli-testnet',
  },
  {
    id: '599',
    name: 'metis-testnet',
  },
  {
    id: '420',
    name: 'optimism-testnet',
  },
  {
    id: '1442',
    name: 'polygon-zkevm-testnet',
  },
  {
    id: '31',
    name: 'rsk-testnet',
  },
  {
    id: '1287',
    name: 'moonbeam-testnet',
  },
  {
    id: '30',
    name: 'rsk',
  },
  {
    id: '5',
    name: 'goerli',
  },
  {
    id: '42170',
    name: 'arbitrum-nova',
  },
  {
    id: '4002',
    name: 'fantom-testnet',
  },
  {
    id: '80001',
    name: 'polygon-testnet',
  },
  {
    id: '421613',
    name: 'arbitrum-testnet',
  },
  {
    id: '10200',
    name: 'gnosis-testnet',
  },
  {
    id: '43113',
    name: 'avalanche-testnet',
  },
  {
    id: '2001',
    name: 'milkomeda',
  },
  {
    id: '200101',
    name: 'milkomeda-testnet',
  },
  {
    id: '11155111',
    name: 'sepolia',
  },
];
