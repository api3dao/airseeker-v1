import { ethers } from 'ethers';
import { calculateUpdateInPercentage, checkUpdateCondition } from './check-condition';

describe('calculateUpdateInPercentage', () => {
  it('calculates increase', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(10), ethers.BigNumber.from(15));
    expect(updateInPercentage).toEqual(50);
  });

  it('calculates negative change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(10), ethers.BigNumber.from(5));
    expect(updateInPercentage).toEqual(50);
  });

  it('calculates zero change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(10), ethers.BigNumber.from(10));
    expect(updateInPercentage).toEqual(0);
  });

  it('calculates 100 percent change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(10), ethers.BigNumber.from(20));
    expect(updateInPercentage).toEqual(100);
  });

  it('calculates positive to negative change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(10), ethers.BigNumber.from(-5));
    expect(updateInPercentage).toEqual(150);
  });

  it('calculates negative to positive change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(-5), ethers.BigNumber.from(5));
    expect(updateInPercentage).toEqual(200);
  });

  it('calculates initial zero to positive change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(0), ethers.BigNumber.from(5));
    expect(updateInPercentage).toEqual(500);
  });

  it('calculates initial zero to negative change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(0), ethers.BigNumber.from(-5));
    expect(updateInPercentage).toEqual(500);
  });

  it('calculates initial positive to zero change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(5), ethers.BigNumber.from(0));
    expect(updateInPercentage).toEqual(100);
  });

  it('calculates initial negative to zero change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(-5), ethers.BigNumber.from(0));
    expect(updateInPercentage).toEqual(100);
  });

  it('calculates initial negative to negative change', () => {
    const updateInPercentage = calculateUpdateInPercentage(ethers.BigNumber.from(-5), ethers.BigNumber.from(-1));
    expect(updateInPercentage).toEqual(80);
  });
});

describe('checkUpdateCondition', () => {
  const providerUrl = 'http://127.0.0.1:8545/';
  const beaconId = '0x2ba0526238b0f2671b7981fd7a263730619c8e849a528088fd4a92350a8c2f2c';

  let readWithDataPointIdSpy: any;
  let dapiServerMock: any;

  beforeEach(() => {
    const readWithDataPointIdMock = (_beaconId: string) => Promise.resolve([ethers.BigNumber.from(500)]);
    readWithDataPointIdSpy = jest.fn().mockImplementation(readWithDataPointIdMock);
    dapiServerMock = {
      connect(_signerOrProvider: ethers.Signer | ethers.providers.Provider | string) {
        return this;
      },
      functions: {
        readWithDataPointId: readWithDataPointIdSpy,
      },
    };
  });

  it('reads dapiserver value and checks the threshold condition to be true for increase', async () => {
    const checkUpdateConditionResult = await checkUpdateCondition(
      providerUrl,
      dapiServerMock as any,
      beaconId,
      10,
      560
    );

    expect(readWithDataPointIdSpy).toHaveBeenNthCalledWith(1, beaconId);
    expect(checkUpdateConditionResult).toEqual(true);
  });

  it('reads dapiserver value and checks the threshold condition to be true for decrease', async () => {
    const readWithDataPointIdOnceSpy = jest
      .fn()
      .mockImplementationOnce(() => Promise.resolve([ethers.BigNumber.from(400)]));
    const checkUpdateConditionResult = await checkUpdateCondition(
      providerUrl,
      { ...dapiServerMock, functions: { readWithDataPointId: readWithDataPointIdOnceSpy } } as any,
      beaconId,
      10,
      450
    );

    expect(readWithDataPointIdOnceSpy).toHaveBeenNthCalledWith(1, beaconId);
    expect(checkUpdateConditionResult).toEqual(true);
  });

  it('reads dapiserver value and checks the threshold condition to be false', async () => {
    const checkUpdateConditionResult = await checkUpdateCondition(
      providerUrl,
      dapiServerMock as any,
      beaconId,
      10,
      480
    );

    expect(readWithDataPointIdSpy).toHaveBeenNthCalledWith(1, beaconId);
    expect(checkUpdateConditionResult).toEqual(false);
  });
});
