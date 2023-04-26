import Bottleneck from 'bottleneck';
import { validSignedData } from '../fixtures';
import { makeApiRequest, makeSignedDataGatewayRequests } from '../../src/make-request';
import { buildAirseekerConfig, buildLocalSecrets } from '../fixtures/config';
import { interpolateSecrets } from '../../src/config';
import { Template } from '../../src/validation';
import { initializeWallets } from '../../src/wallets';
import * as state from '../../src/state';
const { getState, initializeState } = state;

// Jest version 27 has a bug where jest.setTimeout does not work correctly inside describe or test blocks
// https://github.com/facebook/jest/issues/11607
jest.setTimeout(15_000);

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

it('makes a direct api call', async () => {
  const config = buildAirseekerConfig();
  const secrets = buildLocalSecrets();
  initializeState(interpolateSecrets(config, secrets));
  initializeWallets();

  // Mocking Date.now messes with Bottleneck job expiration (which is needed for fast shutdowns)
  const initialState = getState();
  state.setState({
    ...initialState,
    apiLimiters: Object.fromEntries(
      Object.keys(initialState.apiLimiters).map((key) => [
        key,
        { schedule: (_options: any, fn: any) => fn() } as Bottleneck,
      ])
    ),
  });

  jest.spyOn(Date, 'now').mockImplementation(() => 1664532188111);
  const ltcTemplate: state.Id<Template> = {
    id: '0xc43a79e09e53edfdb601acef6b52000ecb7da353aee45255c518fb9d978d9283',
    endpointId: '0x13dea3311fe0d6b84f4daeab831befbc49e19e6494c41e9e065a09c3c68f43b6',
    parameters:
      '0x3173737373730000000000000000000000000000000000000000000000000000746f00000000000000000000000000000000000000000000000000000000000055534400000000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f70617468000000000000000000000000000000000000000000000000000000726573756c7400000000000000000000000000000000000000000000000000005f74696d65730000000000000000000000000000000000000000000000000000313030303030300000000000000000000000000000000000000000000000000066726f6d000000000000000000000000000000000000000000000000000000004c54430000000000000000000000000000000000000000000000000000000000',
  };
  const response = await makeApiRequest(ltcTemplate);

  expect(response).toEqual({
    encodedValue: '0x000000000000000000000000000000000000000000000000000000000344f1d0',
    signature:
      '0x6066a88e80f7c744cef3065a4052d60bb8c89f16c1d40faa41bb7e673fad839572e3e924d151dc003f3f57858fe809706073e93606f9c9cd34303cecc12f9e8a1c',
    timestamp: '1664532188',
  });
});
