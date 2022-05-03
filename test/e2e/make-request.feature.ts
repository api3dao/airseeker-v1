import { validSignedData } from '../fixtures';
import { makeSignedDataGatewayRequests } from '../../src/make-request';
import { initializeState } from '../../src/state';

const mockedSignedDataGateway = {
  apiKey: 'some-api-key',
  url: 'http://localhost:5432/signed-data-gateway',
  templateId: 'template',
  endpointId: 'endpoint',
  parameters:
    '0x3173000000000000000000000000000000000000000000000000000000000000636f696e49640000000000000000000000000000000000000000000000000000626974636f696e00000000000000000000000000000000000000000000000000',
};

it('makes a signed data gateway call', async () => {
  initializeState({ log: { format: 'plain', level: 'INFO' } } as any); // We don't care about airseeker.json file

  const { apiKey, url, templateId, endpointId, parameters } = mockedSignedDataGateway;
  const response = await makeSignedDataGatewayRequests([{ apiKey, url }], { parameters, endpointId, id: templateId });

  expect(response).toEqual(validSignedData);
});
