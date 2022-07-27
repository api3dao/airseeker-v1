import axios from 'axios';
import { ethers } from 'ethers';
import { logger } from './logging';
import { makeSignedDataGatewayRequests, urlJoin } from './make-request';
import { initializeState } from './state';
import { validSignedData } from '../test/fixtures';

const generateRandomBytes32 = () => {
  return ethers.utils.hexlify(ethers.utils.randomBytes(32));
};

// Mock the axios library for the whole module
jest.mock('axios', () => jest.fn());

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
    initializeState({ log: { format: 'plain', level: 'INFO' } } as any); // We don't need airseeker.json file
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
      { additional: { 'Template-ID': templateId } }
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
      { additional: { 'Template-ID': templateId } }
    );
    expect(logger.info).toBeCalledWith(
      `Using the following signed data response: "${JSON.stringify(validSignedData)}"`,
      { additional: { 'Template-ID': templateId } }
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
      { additional: { 'Template-ID': templateId } }
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
      { additional: { 'Template-ID': templateId } }
    );
    expect(logger.warn).toBeCalledWith(`All gateway requests have failed with an error. No response to be used`, {
      additional: { 'Template-ID': templateId },
    });
  });
});
