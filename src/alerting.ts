import { TextEncoder } from 'util';
import { keccak256 } from 'ethers/lib/utils';
import { PrismaClient } from '@prisma/client';
import { BigNumber } from 'ethers';
import * as utils from '@api3/operations-utilities';
import { BeaconSetTrigger, BeaconTrigger } from './validation';
import { calculateUpdateInPercentage } from './calculations';
import { HUNDRED_PERCENT } from './constants';
import { UpdateStatus } from './check-condition';

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

export const checkAndReport = async (
  type: 'Beacon' | 'BeaconSet',
  prisma: PrismaClient,
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
  const prismaPromises = await Promise.allSettled([
    prisma?.dataFeedApiValue.create({
      data: {
        dataFeedId,
        apiValue: parseFloat(offChainValue.toString()),
        timestamp: new Date(offChainTimestamp * 1_000),
        type,
      },
    }),
    prisma?.deviationValue.create({
      data: {
        dataFeedId,
        deviation: parseFloat(calculateUpdateInPercentage(onChainValue, offChainValue).toString()) / HUNDRED_PERCENT,
        chainId,
      },
    }),
  ]);
  await Promise.allSettled(
    prismaPromises
      .filter((result) => result.status === 'rejected')
      .map((failedPromise) =>
        limitedSendToOpsGenieLowLevel(
          {
            priority: 'P2',
            alias: generateOpsGenieAlias(`error-insert-record-airseeker-logger`),
            message: `A Prisma error occured while inserting a record in the Airseeker logger`,
            description: JSON.stringify(failedPromise, null, 2),
          },
          opsGenieConfig
        )
      )
  );

  const currentDeviation =
    (100 * parseFloat(calculateUpdateInPercentage(onChainValue, offChainValue).toString())) / HUNDRED_PERCENT;
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

  // TODO expose multiplier for heartbeat threshold
  if (currentDeviation > alertDeviationThreshold) {
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
  } else if (tsDeltaAbs > (trigger.heartbeatInterval ?? 86400) * heartbeatMultiplier) {
    await Promise.allSettled([
      limitedSendToOpsGenieLowLevel(
        {
          priority: 'P3',
          alias: generateOpsGenieAlias(
            `${UpdateStatus.ON_CHAIN_TIMESTAMP_OLDER_THAN_HEARTBEAT_MESSAGE}${dataFeedId}${chainId}`
          ),
          message: `${UpdateStatus.ON_CHAIN_TIMESTAMP_OLDER_THAN_HEARTBEAT_MESSAGE} for ${type} with ${dataFeedId}`,
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
      limitedCloseOpsGenieAlertWithAlias(
        generateOpsGenieAlias(`${UpdateStatus.DEVIATION_THRESHOLD_REACHED_MESSAGE}${dataFeedId}${chainId}`),
        opsGenieConfig
      ),
    ]);
  }
};
