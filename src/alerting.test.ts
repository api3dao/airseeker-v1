import { BigNumber } from 'ethers';
import { TrimmedDApi } from '@prisma/client';
import { Api3ServerV1 } from '@api3/airnode-protocol-v1';
import {
  checkAndReport,
  recordGatewayResponseSuccess,
  recordRpcProviderResponseSuccess,
  setOpsGenieHandlers,
  setPrisma,
} from './alerting';
import * as state from './state';

jest.mock('@api3/operations-utilities', () => ({
  __esModule: true,
  ...jest.requireActual('@api3/operations-utilities'),
}));

// Normally I'd use DeepMockProxy but that complains about circular dependencies.
const getMockedDb = () => {
  const trimmedDApiFindManyMock = jest.fn();
  trimmedDApiFindManyMock.mockImplementation((): TrimmedDApi[] => {
    return [
      {
        id: '1234',
        name: 'BTC/USD',
        dataFeedId: '0x000',
        isBeaconSet: true,
        category: 'something',
        chainName: 'hardhat',
        supplierCategory: 'managed',
        fundingStatus: 'Funded',
        displayOnMarket: true,
        isNewListing: true,
        estimatedExpiry: new Date(),
        managedAvailable: true,
        upgradeStatus: 'Current',
      },
    ];
  });

  return {
    dataFeedApiValue: {
      create: jest.fn(),
    },
    deviationValue: {
      create: jest.fn(),
    },
    rPCFailures: {
      create: jest.fn(),
    },
    gatewayFailures: {
      create: jest.fn(),
    },
    trimmedDApi: {
      findMany: trimmedDApiFindManyMock,
    },
  };
};

describe('alerting', () => {
  const mockLimitedCloseOpsGenieAlertWithAlias = jest.fn();
  const mockLimitedSendToOpsGenieLowLevel = jest.fn();
  let prismaMock = getMockedDb();

  beforeEach(() => {
    jest.resetAllMocks();
    mockLimitedCloseOpsGenieAlertWithAlias.mockReset();
    // eslint-disable-next-line no-console
    mockLimitedCloseOpsGenieAlertWithAlias.mockImplementation(console.log);
    mockLimitedSendToOpsGenieLowLevel.mockReset();
    // eslint-disable-next-line no-console
    mockLimitedSendToOpsGenieLowLevel.mockImplementation(console.log);
    setOpsGenieHandlers(mockLimitedCloseOpsGenieAlertWithAlias, mockLimitedSendToOpsGenieLowLevel);

    prismaMock = getMockedDb();
    setPrisma(prismaMock);
  });

  it('checks, reports and does not alert', async () => {
    await checkAndReport(
      'BeaconSet',
      '0xa2828adc015a2a59989b0841d5ff383aad229dd0d7070542a46da72d5e5a1171',
      BigNumber.from(100),
      1000000000,
      BigNumber.from(101),
      1000000001,
      '1',
      { heartbeatInterval: 86400, deviationThreshold: 1 },
      2,
      1.1
    );

    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(3);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(0);
    expect(prismaMock.dataFeedApiValue.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.deviationValue.create).toHaveBeenCalledTimes(1);
  });

  it('checks, reports and does alert due to exceeded deviation threshold', async () => {
    await checkAndReport(
      'BeaconSet',
      '0xa2828adc015a2a59989b0841d5ff383aad229dd0d7070542a46da72d5e5a1171',
      BigNumber.from(100),
      1000000000,
      BigNumber.from(103),
      1000000001,
      '1',
      { heartbeatInterval: 86400, deviationThreshold: 1 },
      2,
      1.1
    );

    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(1);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(1);
    expect(prismaMock.dataFeedApiValue.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.deviationValue.create).toHaveBeenCalledTimes(1);
  });

  it('checks, reports and does alert due to exceeded heartbeat staleness', async () => {
    await checkAndReport(
      'BeaconSet',
      '0xa2828adc015a2a59989b0841d5ff383aad229dd0d7070542a46da72d5e5a1171',
      BigNumber.from(100),
      1000000000,
      BigNumber.from(100),
      100000000 + 86400 * 1.1 + 1,
      '1',
      { heartbeatInterval: 86400, deviationThreshold: 1 },
      2,
      1.1
    );

    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(1);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(1);
    expect(prismaMock.dataFeedApiValue.create).toHaveBeenCalledTimes(1);

    // TODO why is deviationValue not created in this scenario
    expect(prismaMock.deviationValue.create).toHaveBeenCalledTimes(0);
  });

  it('handles big numbers', async () => {
    await checkAndReport(
      'BeaconSet',
      '0xa2828adc015a2a59989b0841d5ff383aad229dd0d7070542a46da72d5e5a1171',
      BigNumber.from(100),
      1000000000,
      BigNumber.from('115792089237316195423570985008687907853269984665640564039457584007913129639935'), // the maximum value of uint256
      1000333333,
      '1',
      { heartbeatInterval: 86400, deviationThreshold: 1 },
      2,
      1.1
    );

    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(0);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(2);
    expect(prismaMock.dataFeedApiValue.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.deviationValue.create).toHaveBeenCalledTimes(1);
  });

  it('alerts on a dead gateway', async () => {
    const getStateSpy = jest.spyOn(state, 'getState');

    getStateSpy.mockReturnValue({
      config: {
        beacons: {
          '0x000': { templateId: '0x001', airnode: '0xairnode' },
        },
      },
    } as any);

    await recordGatewayResponseSuccess('0x001', 'https://gateway.url', false);
    await recordGatewayResponseSuccess('0x001', 'https://gateway.url', false);
    await recordGatewayResponseSuccess('0x001', 'https://gateway.url', false);
    await recordGatewayResponseSuccess('0x001', 'https://gateway.url', false);

    // At this point the gateway has 4x bad "strikes" against it - so it should alert.

    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(3);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(1);

    // Then we give it a good result...
    await recordGatewayResponseSuccess('0x001', 'https://gateway.url', true);

    // and we expect that it has closed the alert and not alerted again
    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(4);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(1);
  });

  it('alerts on a dead rpc url', async () => {
    const getStateSpy = jest.spyOn(state, 'getState');

    getStateSpy.mockReturnValue({
      config: {
        chains: {
          '1': { providers: { 'bad-provider': { url: 'https://a.url' } } },
        },
      },
    } as any);

    const contract = { provider: { connection: { url: 'https://a.url' } } } as unknown as Api3ServerV1;

    await recordRpcProviderResponseSuccess(contract, false);
    await recordRpcProviderResponseSuccess(contract, false);
    await recordRpcProviderResponseSuccess(contract, false);
    await recordRpcProviderResponseSuccess(contract, false);

    // We've given it four bad results, so we expect an alert on the 4th response
    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(3);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(1);

    // Then we give it a good result...
    await recordRpcProviderResponseSuccess(contract, true);

    // and we expect that it has closed the alert and not alerted again
    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(4);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(1);
  });
});
