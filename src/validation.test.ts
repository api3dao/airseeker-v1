import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import { ZodError } from 'zod';
import { Config, configSchema } from './validation';
import { interpolateSecrets } from './config';

const envVariables = {
  AIRSEEKER_WALLET_MNEMONIC: 'achieve climb couple wait accident symbol spy blouse reduce foil echo label',
  CP_SELF_HOSTED_MAINNET_URL: 'https://some.self.hosted.mainnet.url',
  CP_INFURA_MAINNET_URL: 'https://some.infura.mainnet.url',
  CP_INFURA_ROPSTEN_URL: 'https://some.influra.ropsten.url',
  HTTP_SIGNED_DATA_GATEWAY_KEY: '18e06827-8544-4b0f-a639-33df3b5bc62f',
  HTTP_SIGNED_DATA_GATEWAY_URL: 'https://some.http.signed.data.gateway.url/',
  SS_CURRENCY_CONVERTER_API_KEY: '164mTCl3fzd7VcIDQMHtq5',
};

it('successfully parses example configuration', () => {
  const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8'));
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).not.toThrow();
});

it('fails if chain is missing Api3ServerV1 contract address', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  delete config.chains['1'].contracts['Api3ServerV1'];
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: 'Api3ServerV1 contract address is missing',
        path: ['chains', '1', 'contracts'],
      },
    ])
  );
});

it('fails if derived beaconId is different to beacons.<beaconId>', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const firstBeaconId = Object.keys(config.beacons)[0];
  const randomBeaconId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  config.beacons[randomBeaconId] = config.beacons[firstBeaconId];
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `Beacon ID "${randomBeaconId}" is invalid`,
        path: ['beacons', randomBeaconId],
      },
    ])
  );
});

it('fails if derived beaconSetId is different to beaconSets.<beaconSetId>', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const firstBeaconSetId = Object.keys(config.beaconSets)[0];
  const randomBeaconSetId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  config.beaconSets[randomBeaconSetId] = config.beaconSets[firstBeaconSetId];
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `BeaconSet ID "${randomBeaconSetId}" is invalid`,
        path: ['beaconSets', randomBeaconSetId],
      },
    ])
  );
});

it('fails if derived templateId is different to templates.<templateId>', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const [firstTemplateId, firstTemplateValues] = Object.entries(config.templates)[0];
  const randomEndpointId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  firstTemplateValues.endpointId = randomEndpointId;
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `Template ID "${firstTemplateId}" is invalid`,
        path: ['templates', firstTemplateId],
      },
    ])
  );
});

it('fails if derived endpointId is different to endpoints.<endpointId>', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const [_, firstEndpointValues] = Object.entries(config.endpoints)[0];
  const randomEndpointId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  config.endpoints = { ...config.endpoints, [randomEndpointId]: firstEndpointValues };

  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `Endpoint ID "${randomEndpointId}" is invalid`,
        path: ['endpoints', randomEndpointId],
      },
    ])
  );
});

it('fails if beacons.<beaconId>.airnode is not defined in gateways', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );

  const [gatewayId] = Object.keys(config.gateways);
  delete config.gateways[gatewayId];
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError(
      Object.entries(config.beacons)
        .filter(([_, beacon]) => beacon.fetchMethod !== 'api' && beacon.airnode === gatewayId)
        .map(([beaconId, beacon]) => ({
          code: 'custom',
          message: `Gateway "${beacon.airnode}" is not defined in the config.gateways object`,
          path: ['beacons', beaconId, 'airnode'],
        }))
    )
  );
});

it('fails if beacons.<beaconId>.templateId is not defined in templates', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const [firstBeaconId, firstBeaconValue] = Object.entries(config.beacons)[0];
  delete config.templates[firstBeaconValue.templateId];
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `Template ID "${firstBeaconValue.templateId}" is not defined in the config.templates object`,
        path: ['beacons', firstBeaconId, 'templateId'],
      },
    ])
  );
});

it('fails if beaconSets.<beaconSetId>.[beaconId] is not defined in beacons', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const [firstBeaconSetId, firstBeaconSetValue] = Object.entries(config.beaconSets)[0];
  const firstBeaconSetBeaconId = firstBeaconSetValue[0];
  delete config.beacons[firstBeaconSetBeaconId];
  delete config.triggers.dataFeedUpdates[1];
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `Beacon ID "${firstBeaconSetBeaconId}" is not defined in the config.beacons object`,
        path: ['beaconSets', firstBeaconSetId, 0],
      },
    ])
  );
});

it('fails if triggers.dataFeedUpdates.<chainId> is not defined in chains', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const [firstChainId, firstChainValues] = Object.entries(config.triggers.dataFeedUpdates)[0];
  const randomChainId = '123';
  config.triggers.dataFeedUpdates[randomChainId] = firstChainValues;
  delete config.triggers.dataFeedUpdates[firstChainId];
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `Chain ID "${randomChainId}" is not defined in the config.chains object`,
        path: ['triggers', 'dataFeedUpdates', randomChainId],
      },
    ])
  );
});

it('fails if triggers.dataFeedUpdates.<chainId>.<sponsorAddress>.beacons.<beaconId> is not defined in beacons', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const randomBeaconId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const firstChainId = Object.keys(config.triggers.dataFeedUpdates)[0];
  const firstSponsorAddress = Object.keys(config.triggers.dataFeedUpdates[firstChainId])[0];
  config.triggers.dataFeedUpdates[firstChainId][firstSponsorAddress].beacons[0].beaconId = randomBeaconId;
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `Beacon ID "${randomBeaconId}" is not defined in the config.beacons object`,
        path: ['triggers', 'dataFeedUpdates', firstChainId, firstSponsorAddress, 'beacons', 0],
      },
    ])
  );
});

it('fails if triggers.dataFeedUpdates.<chainId>.<sponsorAddress>.beaconSets.<beaconSetId> is not defined in beaconSets', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );
  const randomBeaconSetId = ethers.utils.hexlify(ethers.utils.randomBytes(32));
  const firstChainId = Object.keys(config.triggers.dataFeedUpdates)[0];
  const firstSponsorAddress = Object.keys(config.triggers.dataFeedUpdates[firstChainId])[0];
  config.triggers.dataFeedUpdates[firstChainId][firstSponsorAddress].beaconSets[0].beaconSetId = randomBeaconSetId;
  const interpolatedConfig = interpolateSecrets(config, envVariables);

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `BeaconSet ID "${randomBeaconSetId}" is not defined in the config.beaconSets object`,
        path: ['triggers', 'dataFeedUpdates', firstChainId, firstSponsorAddress, 'beaconSets', 0],
      },
    ])
  );
});

it('fails if endpoints.<entpointId>.oisTitle is not defined in ois[any].title', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );

  // Empty ois object
  const newConfig = { ...config, ois: [] };
  const interpolatedConfig = interpolateSecrets(newConfig, envVariables);
  const firstEndpointId = Object.keys(config.endpoints)[0];

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `OIS titled "${config.endpoints[firstEndpointId].oisTitle}" is not defined in the config.ois object`,
        path: ['endpoints', firstEndpointId, 'oisTitle'],
      },
    ])
  );
});

it('fails if endpoints.<entpointId>.endpointName is not defined in ois[idx(endpoints.<endpointId>.oisTitle)].endpoints[any].name', () => {
  const config: Config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config', 'airseeker.example.json'), 'utf8')
  );

  // Create ois object with empty endpoints
  const newConfig = { ...config, ois: [{ ...config.ois[0], endpoints: [] }] };
  const interpolatedConfig = interpolateSecrets(newConfig, envVariables);
  const firstEndpointId = Object.keys(config.endpoints)[0];

  expect(() => configSchema.parse(interpolatedConfig)).toThrow(
    new ZodError([
      {
        code: 'custom',
        message: `OIS titled "${config.endpoints[firstEndpointId].oisTitle}" doesn't have referenced endpoint ${config.endpoints[firstEndpointId].endpointName}`,
        path: ['endpoints', firstEndpointId, 'endpointName'],
      },
    ])
  );
});
