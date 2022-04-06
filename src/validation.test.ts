import fs from 'fs';
import path from 'path';
import { configSchema } from './validation';
import { interpolateSecrets } from './config';

const envVariables = {
  CP_SELF_HOSTED_MAINNET_URL: 'https://some.self.hosted.mainnet.url',
  CP_INFURA_MAINNET_URL: 'https://some.infura.mainnet.url',
  CP_INFURA_ROPSTEN_URL: 'https://some.influra.ropsten.url',
  HTTP_GATEWAY_API_KEY: '18e06827-8544-4b0f-a639-33df3b5bc62f',
};

it('successfully parses example configuration', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'config.example.json'), 'utf8'));
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).not.toThrow();
});
