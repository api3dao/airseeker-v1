import { validSignedData } from '../fixtures';
import { makeSignedDataGatewayRequests } from '../../src/make-request';

const mockedSignedDataGateway = {
  apiKey: 'some-api-key',
  url: 'http://localhost:5432/signed-data-gateway',
  endpointId: 'endpoint',
  parameters:
    '0x3173000000000000000000000000000000000000000000000000000000000000636f696e49640000000000000000000000000000000000000000000000000000626974636f696e00000000000000000000000000000000000000000000000000',
};

it('makes a signed data gateway call', async () => {
  const { apiKey, url, endpointId, parameters } = mockedSignedDataGateway;
  const response = await makeSignedDataGatewayRequests([{ apiKey, url }], { parameters, endpointId });

  expect(response).toEqual(validSignedData);
});
