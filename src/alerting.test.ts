import { DeepMockProxy, mockDeep } from 'jest-mock-extended';
import { BigNumber } from 'ethers';
import { PrismaClient } from '@prisma/client';
import { checkAndReport, setOpsGenieHandlers } from './alerting';
import prisma from '../src/database';

jest.mock('../src/database', () => ({
  __esModule: true,
  default: mockDeep<PrismaClient>(),
}));

const prismaMock = prisma as unknown as DeepMockProxy<PrismaClient>;

jest.mock('@api3/operations-utilities', () => ({
  __esModule: true,
  ...jest.requireActual('@api3/operations-utilities'),
}));

describe('alerting', () => {
  const mockLimitedCloseOpsGenieAlertWithAlias = jest.fn();
  const mockLimitedSendToOpsGenieLowLevel = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    mockLimitedCloseOpsGenieAlertWithAlias.mockReset();
    // eslint-disable-next-line no-console
    mockLimitedCloseOpsGenieAlertWithAlias.mockImplementation(console.log);
    mockLimitedSendToOpsGenieLowLevel.mockReset();
    // eslint-disable-next-line no-console
    mockLimitedSendToOpsGenieLowLevel.mockImplementation(console.log);
    setOpsGenieHandlers(mockLimitedCloseOpsGenieAlertWithAlias, mockLimitedSendToOpsGenieLowLevel);
  });

  it('checks, reports and does not alert', async () => {
    await checkAndReport(
      'Beacon',
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

    expect(mockLimitedCloseOpsGenieAlertWithAlias).toHaveBeenCalledTimes(2);
    expect(mockLimitedSendToOpsGenieLowLevel).toHaveBeenCalledTimes(0);
    expect(prismaMock.dataFeedApiValue.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.deviationValue.create).toHaveBeenCalledTimes(1);
  });

  it('checks, reports and does alert due to exceeded deviation threshold', async () => {
    await checkAndReport(
      'Beacon',
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
      'Beacon',
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
    expect(prismaMock.deviationValue.create).toHaveBeenCalledTimes(1);
  });

  it('handles big numbers', async () => {
    await checkAndReport(
      'Beacon',
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
});
