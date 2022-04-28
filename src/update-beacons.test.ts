import { ethers } from 'ethers';
import { logger } from './logging';
import { readOnChainBeaconData } from './update-beacons';
import { getUnixTimestamp } from '../test/fixtures';

it('readOnChainBeaconData', async () => {
  jest.spyOn(logger, 'log');
  const feedValue = { value: ethers.BigNumber.from('123'), timestamp: getUnixTimestamp('2019-3-21') };
  const readDataFeedWithIdMock = jest
    .fn()
    .mockRejectedValueOnce(new Error('cannot read chain'))
    .mockRejectedValueOnce(new Error('some other error'))
    .mockResolvedValue(feedValue);

  const dapiServer: any = {
    connect() {
      return this;
    },
    readDataFeedWithId: readDataFeedWithIdMock,
  };

  const providerUrl = 'http://127.0.0.1:8545/';
  const voidSigner = new ethers.VoidSigner(
    ethers.constants.AddressZero,
    new ethers.providers.JsonRpcProvider(providerUrl)
  );

  const onChainBeacon = await readOnChainBeaconData(voidSigner, dapiServer, 'some-id', { retries: 100_000 });

  expect(onChainBeacon).toEqual({
    data: feedValue,
    success: true,
  });
  expect(logger.log).toHaveBeenCalledTimes(2);
  expect(logger.log).toHaveBeenNthCalledWith(1, 'Failed attempt to read data feed. Error: Error: cannot read chain');
  expect(logger.log).toHaveBeenNthCalledWith(2, 'Failed attempt to read data feed. Error: Error: some other error');
});
