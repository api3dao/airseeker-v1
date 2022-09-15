import { ethers } from 'ethers';
import { logger } from './logging';
import * as api from './read-data-feed-with-id';
import { getUnixTimestamp } from '../test/fixtures';

describe('readDataFeedWithId', () => {
  it('returns on chain beacon value', async () => {
    jest.spyOn(logger, 'warn');
    const feedValue = { value: ethers.BigNumber.from('123'), timestamp: getUnixTimestamp('2019-3-21') };
    const readDataFeedWithIdMock = jest
      .fn()
      .mockRejectedValueOnce(new Error('cannot read chain'))
      .mockRejectedValueOnce(new Error('some other error'))
      .mockResolvedValue(feedValue);

    const dapiServer: any = {
      address: ethers.utils.getAddress(ethers.utils.hexlify(ethers.utils.randomBytes(20))),
      connect() {
        return this;
      },
      readDataFeedWithId: readDataFeedWithIdMock,
    };

    const providerUrl = 'http://127.0.0.1:8545/';
    const voidSigner = new ethers.VoidSigner(
      ethers.constants.AddressZero,
      new ethers.providers.StaticJsonRpcProvider(providerUrl)
    );

    const onChainBeaconData = await api.readDataFeedWithId(voidSigner, dapiServer, 'some-id', { retries: 100_000 }, {});

    expect(onChainBeaconData).toEqual(feedValue);
    expect(logger.warn).toHaveBeenCalledTimes(2);
    expect(logger.warn).toHaveBeenNthCalledWith(
      1,
      'Failed attempt to read data feed. Error: Error: cannot read chain',
      {
        meta: { 'Dapi-Server': dapiServer.address },
      }
    );
    expect(logger.warn).toHaveBeenNthCalledWith(2, 'Failed attempt to read data feed. Error: Error: some other error', {
      meta: { 'Dapi-Server': dapiServer.address },
    });
  });
});
