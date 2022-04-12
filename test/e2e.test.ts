import { signedDataCoingeckoAirnode } from './fixtures';
import { makeSignedDataGatewayRequests } from '../src/make-request';

it('makes a signed data gateway call', async () => {
  const { apiKey, url, endpointId, parameters } = signedDataCoingeckoAirnode;
  const response = await makeSignedDataGatewayRequests([{ apiKey, url }], { parameters, endpointId }, 8_000);

  expect(response).not.toBeNull();
}, 10_000);
