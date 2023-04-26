import axios from 'axios';
import { ethers } from 'ethers';
import * as node from '@api3/airnode-node';
import * as abi from '@api3/airnode-abi';
import Bottleneck from 'bottleneck';
import { logger } from './logging';
import { makeApiRequest, makeSignedDataGatewayRequests, signWithTemplateId, urlJoin } from './make-request';
import * as state from './state';
import { buildGatewayLimiter, getRandomId } from './state';
import { validSignedData } from '../test/fixtures';

const generateRandomBytes32 = () => ethers.utils.hexlify(ethers.utils.randomBytes(32));

// Mock the axios library for the whole module
jest.mock('axios', jest.fn);

it('urlJoin creates a valid gateway URL', () => {
  expect(
    urlJoin(
      'https://57sv91sb73.execute-api.us-east-1.amazonaws.com/v1/',
      '0xfb87102cdabadf905321521ba0b3cbf74ad09c5d400ac2eccdbef8d6143e78c4'
    )
  ).toBe(
    'https://57sv91sb73.execute-api.us-east-1.amazonaws.com/v1/0xfb87102cdabadf905321521ba0b3cbf74ad09c5d400ac2eccdbef8d6143e78c4'
  );

  expect(
    urlJoin(
      'https://57sv91sb73.execute-api.us-east-1.amazonaws.com/v1',
      '0xfb87102cdabadf905321521ba0b3cbf74ad09c5d400ac2eccdbef8d6143e78c4'
    )
  ).toBe(
    'https://57sv91sb73.execute-api.us-east-1.amazonaws.com/v1/0xfb87102cdabadf905321521ba0b3cbf74ad09c5d400ac2eccdbef8d6143e78c4'
  );
});

describe('makeSignedDataGatewayRequests', () => {
  const templateId = generateRandomBytes32();

  beforeEach(() => {
    state.initializeState({ log: { format: 'plain', level: 'INFO' } } as any); // We don't need airseeker.json file
  });

  it('makes requests to all gateways and resolves with the first successful value', async () => {
    const mockedAxios = (axios as any as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('timeout error');
      })
      .mockReturnValueOnce({
        data: {
          timestamp: 'invalid',
          encodedValue: '0x000000000000000000000000000000000000000000000000000000000invalid',
          signature: 'invalid signature',
        },
      })
      .mockReturnValueOnce({
        data: validSignedData,
      });
    jest.spyOn(logger, 'info');
    jest.spyOn(logger, 'warn');

    const response = await makeSignedDataGatewayRequests(
      [
        { apiKey: 'api-key-1', url: 'https://gateway-1.com/' },
        { apiKey: 'api-key-2', url: 'https://gateway-2.com/' },
        { apiKey: 'api-key-3', url: 'https://gateway-3.com/' },
      ],
      { parameters: '0x123456789', endpointId: 'endpoint', id: templateId }
    );

    expect(response).toEqual(validSignedData);
    expect(mockedAxios).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to make signed data gateway request for gateway: "https://gateway-1.com/endpoint". Error: "Error: timeout error"',
      { meta: { 'Template-ID': templateId } }
    );
    const zodErrors = [
      {
        validation: 'regex',
        code: 'invalid_string',
        message: 'Invalid',
        path: ['encodedValue'],
      },
      {
        validation: 'regex',
        code: 'invalid_string',
        message: 'Invalid',
        path: ['signature'],
      },
    ];
    expect(logger.warn).toHaveBeenCalledWith(
      `Failed to parse signed data response for gateway: "https://gateway-2.com/endpoint". Error: "${JSON.stringify(
        zodErrors,
        null,
        2
      )}"`,
      { meta: { 'Template-ID': templateId } }
    );
    expect(logger.info).toHaveBeenCalledWith(
      `Using the following signed data response: "${JSON.stringify(validSignedData)}"`,
      { meta: { 'Template-ID': templateId } }
    );
  });

  it('makes requests to all gateways and resolves with the first successful value with limiter', async () => {
    const mockedAxios = (axios as any as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('timeout error');
      })
      .mockReturnValueOnce({
        data: {
          timestamp: 'invalid',
          encodedValue: '0x000000000000000000000000000000000000000000000000000000000invalid',
          signature: 'invalid signature',
        },
      })
      .mockReturnValueOnce({
        data: validSignedData,
      });
    jest.spyOn(logger, 'info');
    jest.spyOn(logger, 'warn');

    const response = await makeSignedDataGatewayRequests(
      buildGatewayLimiter([
        { apiKey: 'api-key-1', url: 'https://gateway-1.com/' },
        { apiKey: 'api-key-2', url: 'https://gateway-2.com/' },
        { apiKey: 'api-key-3', url: 'https://gateway-3.com/' },
      ]),
      { parameters: '0x123456789', endpointId: 'endpoint', id: templateId }
    );

    expect(response).toEqual(validSignedData);
    expect(mockedAxios).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to make signed data gateway request for gateway: "https://gateway-1.com/endpoint". Error: "Error: timeout error"',
      { meta: { 'Template-ID': templateId } }
    );
    const zodErrors = [
      {
        validation: 'regex',
        code: 'invalid_string',
        message: 'Invalid',
        path: ['encodedValue'],
      },
      {
        validation: 'regex',
        code: 'invalid_string',
        message: 'Invalid',
        path: ['signature'],
      },
    ];
    expect(logger.warn).toHaveBeenCalledWith(
      `Failed to parse signed data response for gateway: "https://gateway-2.com/endpoint". Error: "${JSON.stringify(
        zodErrors,
        null,
        2
      )}"`,
      { meta: { 'Template-ID': templateId } }
    );
    expect(logger.info).toHaveBeenCalledWith(
      `Using the following signed data response: "${JSON.stringify(validSignedData)}"`,
      { meta: { 'Template-ID': templateId } }
    );
  });

  it('makes requests and resolves even for legacy responses', async () => {
    const mockedAxios = (axios as any as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('timeout error');
      })
      .mockReturnValueOnce({
        data: {
          timestamp: 'invalid',
          encodedValue: '0x000000000000000000000000000000000000000000000000000000000invalid',
          signature: 'invalid signature',
        },
      })
      .mockReturnValueOnce({
        data: {
          data: { timestamp: validSignedData.timestamp, value: validSignedData.encodedValue },
          signature: validSignedData.signature,
        },
      });
    jest.spyOn(logger, 'info');
    jest.spyOn(logger, 'warn');

    const response = await makeSignedDataGatewayRequests(
      [
        { apiKey: 'api-key-1', url: 'https://gateway-1.com/' },
        { apiKey: 'api-key-2', url: 'https://gateway-2.com/' },
        { apiKey: 'api-key-3', url: 'https://gateway-3.com/' },
      ],
      { parameters: '0x123456789', endpointId: 'endpoint', id: templateId }
    );

    expect(response).toEqual(validSignedData);
    expect(mockedAxios).toHaveBeenCalledTimes(3);
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to make signed data gateway request for gateway: "https://gateway-1.com/endpoint". Error: "Error: timeout error"',
      { meta: { 'Template-ID': templateId } }
    );
    const zodErrors = [
      {
        validation: 'regex',
        code: 'invalid_string',
        message: 'Invalid',
        path: ['encodedValue'],
      },
      {
        validation: 'regex',
        code: 'invalid_string',
        message: 'Invalid',
        path: ['signature'],
      },
    ];
    expect(logger.warn).toHaveBeenCalledWith(
      `Failed to parse signed data response for gateway: "https://gateway-2.com/endpoint". Error: "${JSON.stringify(
        zodErrors,
        null,
        2
      )}"`,
      { meta: { 'Template-ID': templateId } }
    );
    expect(logger.info).toHaveBeenCalledWith(
      `Using the following signed data response: "${JSON.stringify(validSignedData)}"`,
      { meta: { 'Template-ID': templateId } }
    );
  });

  it('handles a case when all gateways error out', async () => {
    const mockedAxios = (axios as any as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('timeout error');
      })
      .mockReturnValueOnce({
        data: {
          timestamp: 'invalid',
          encodedValue: '0x000000000000000000000000000000000000000000000000000000000invalid',
          signature: validSignedData.signature,
        },
      });
    jest.spyOn(logger, 'info');
    jest.spyOn(logger, 'warn');

    await expect(
      makeSignedDataGatewayRequests(
        [
          { apiKey: 'api-key-1', url: 'https://gateway-1.com/' },
          { apiKey: 'api-key-2', url: 'https://gateway-2.com/' },
        ],
        { parameters: '0x123456789', endpointId: 'endpoint', id: templateId }
      )
    ).rejects.toThrow();

    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(logger.info).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(
      'Failed to make signed data gateway request for gateway: "https://gateway-1.com/endpoint". Error: "Error: timeout error"',
      { meta: { 'Template-ID': templateId } }
    );
    const zodErrors = [
      {
        validation: 'regex',
        code: 'invalid_string',
        message: 'Invalid',
        path: ['encodedValue'],
      },
    ];
    expect(logger.warn).toHaveBeenCalledWith(
      `Failed to parse signed data response for gateway: "https://gateway-2.com/endpoint". Error: "${JSON.stringify(
        zodErrors,
        null,
        2
      )}"`,
      { meta: { 'Template-ID': templateId } }
    );
    expect(logger.warn).toHaveBeenCalledWith(`All gateway requests have failed with an error. No response to be used`, {
      meta: { 'Template-ID': templateId },
    });
  });
});

it('signWithTemplateId creates valid signature', async () => {
  jest.spyOn(state, 'getState').mockImplementation(() => {
    return {
      airseekerWalletPrivateKey: ethers.Wallet.fromMnemonic(
        'achieve climb couple wait accident symbol spy blouse reduce foil echo label'
      ).privateKey,
    } as state.State;
  });
  const data = await signWithTemplateId(
    '0x8f0e59a6cee0c2a31a87fbf228714ed7a65855aec64835aad20145fd2530415b',
    '1664478526',
    '0x00000000000000000000000000000000000000000000000000caafe9188031d6'
  );
  expect(data).toBe(
    '0xa14306d784b25ae0556d7c74ba93c31a4221c4a9ebb55f98c5ccd582a40e9f053636708a772f4cc77274bc56b9e4719355b64215fff8ba25dd46fe451def2b701b'
  );
});

describe('makeApiRequest', () => {
  beforeEach(() => {
    jest.spyOn(abi, 'decode');
    jest.spyOn(Date, 'now').mockImplementation(() => 1664532188111);
    jest.spyOn(logger, 'info');
    jest.spyOn(logger, 'warn');
  });
  afterEach(() => {
    jest.clearAllMocks();
  });
  const template = {
    endpointId: '0x57ec49db18ff1164c921592ab3b10804e468de892575efe2037d48b7c07c2d28',
    parameters:
      '0x317373737300000000000000000000000000000000000000000000000000000073796d626f6c0000000000000000000000000000000000000000000000000000616176655f6574680000000000000000000000000000000000000000000000005f7061746800000000000000000000000000000000000000000000000000000070726963650000000000000000000000000000000000000000000000000000005f74797065000000000000000000000000000000000000000000000000000000696e7432353600000000000000000000000000000000000000000000000000005f74696d657300000000000000000000000000000000000000000000000000003130303030303030303030303030303030303000000000000000000000000000',
    id: '0x8f0e59a6cee0c2a31a87fbf228714ed7a65855aec64835aad20145fd2530415b',
  };

  it('make succesful call', async () => {
    jest.spyOn(state, 'getState').mockImplementation(() => {
      return {
        airseekerWalletPrivateKey: ethers.Wallet.fromMnemonic(
          'achieve climb couple wait accident symbol spy blouse reduce foil echo label'
        ).privateKey,
        apiLimiters: { [template.id]: new Bottleneck({ id: getRandomId() }) },
        config: {
          endpoints: {
            '0x57ec49db18ff1164c921592ab3b10804e468de892575efe2037d48b7c07c2d28': {
              oisTitle: 'Mock Ois',
              endpointName: 'Mock Endpoint Name',
            },
          },
          log: { format: 'plain', level: 'INFO' },
        } as any,
      } as state.State;
    });

    jest.spyOn(node.api, 'callApi').mockImplementation(async () => {
      return [
        [],
        {
          success: true,
          data: {
            encodedValue: '0x00000000000000000000000000000000000000000000000000cd698844eba65a',
            rawValue: { symbol: 'aave_eth', price: 0.05781840421844745, timestamp: 1664532168158 },
            values: ['57818404218447450'],
          },
        },
      ];
    });

    const data = await makeApiRequest(template);

    expect(data).toStrictEqual({
      timestamp: '1664532188',
      encodedValue: '0x00000000000000000000000000000000000000000000000000cd698844eba65a',
      signature:
        '0x598c29e74e799dbfce393208ad698bf1f4787c46afa0ac1608d0a02d440d092012000d1fad42ebd3b76c88aa16368af28aed88489ae017b48d91e77fad10a8301c',
    });
    expect(abi.decode).toHaveBeenLastCalledWith(template.parameters);
    expect(abi.decode).toHaveLastReturnedWith({
      symbol: 'aave_eth',
      _path: 'price',
      _type: 'int256',
      _times: '1000000000000000000',
    });
    expect(logger.info).toHaveBeenCalledTimes(0);
    expect(logger.warn).toHaveBeenCalledTimes(0);
  });

  it('handle the case where API call failed', async () => {
    jest.spyOn(state, 'getState').mockImplementation(() => {
      return {
        airseekerWalletPrivateKey: ethers.Wallet.fromMnemonic(
          'achieve climb couple wait accident symbol spy blouse reduce foil echo label'
        ).privateKey,
        apiLimiters: { [template.id]: new Bottleneck({ id: getRandomId() }) },
        config: {
          endpoints: {
            '0x57ec49db18ff1164c921592ab3b10804e468de892575efe2037d48b7c07c2d28': {
              oisTitle: 'Mock Ois',
              endpointName: 'Mock Endpoint Name',
            },
          },
          log: { format: 'plain', level: 'INFO' },
        } as any,
      } as state.State;
    });

    jest.spyOn(node.api, 'callApi').mockImplementation(async () => {
      return [
        [],
        {
          success: false,
          errorMessage: 'Mock error message',
        },
      ];
    });

    await expect(makeApiRequest(template)).rejects.toThrow();
    expect(logger.warn).toHaveBeenCalledWith(
      `Failed to make direct API request for the endpoint [Mock Ois] Mock Endpoint Name.`,
      { meta: { 'Template-ID': template.id } }
    );
  });

  it('handle the case where signing encodedValue failed because improper signer wallet', async () => {
    jest.spyOn(state, 'getState').mockImplementation(() => {
      return {
        // Removed AirseekerWallet to make signer function fail
        config: {
          endpoints: {
            '0x57ec49db18ff1164c921592ab3b10804e468de892575efe2037d48b7c07c2d28': {
              oisTitle: 'Mock Ois',
              endpointName: 'Mock Endpoint Name',
            },
          },
          log: { format: 'plain', level: 'INFO' },
        } as any,
        apiLimiters: { [template.id]: new Bottleneck({ id: getRandomId() }) },
      } as state.State;
    });

    // Succesful API call
    jest.spyOn(node.api, 'callApi').mockImplementation(async () => {
      return [
        [],
        {
          success: true,
          data: {
            encodedValue: '0x00000000000000000000000000000000000000000000000000cd698844eba65a',
            rawValue: { symbol: 'aave_eth', price: 0.05781840421844745, timestamp: 1664532168158 },
            values: ['57818404218447450'],
          },
        },
      ];
    });

    await expect(makeApiRequest(template)).rejects.toThrow();
    expect(logger.warn).toHaveBeenCalledTimes(1);
  });
});
