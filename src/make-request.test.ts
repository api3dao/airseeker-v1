import urlJoin from 'url-join';
import axios from 'axios';
import { makeSignedDataGatewayRequests } from './make-request';
import { validSignedData } from '../test/fixtures';

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
  it('makes requests to all gateways and resolves with the first successful value', async () => {
    const mockedAxios = (axios as any as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('timeout error');
      })
      .mockReturnValueOnce({ data: { data: 'invalid', signature: 'invalid signature' } })
      .mockReturnValueOnce({
        data: validSignedData,
      });
    jest.spyOn(global.console, 'log');

    const response = await makeSignedDataGatewayRequests(
      [
        { apiKey: 'api-key-1', url: 'https://gateway-1.com/' },
        { apiKey: 'api-key-2', url: 'https://gateway-2.com/' },
        { apiKey: 'api-key-3', url: 'https://gateway-3.com/' },
      ],
      { parameters: '0x123456789', endpointId: 'endpoint' },
      100
    );

    expect(response).toEqual(validSignedData);
    expect(mockedAxios).toHaveBeenCalledTimes(3);
    expect(console.log).toHaveBeenCalledWith(
      'Failed to make signed data gateway request for gateway: "https://gateway-1.com/endpoint". Error: "Error: timeout error"'
    );
    const zodErrors = [
      {
        code: 'invalid_type',
        expected: 'object',
        received: 'string',
        path: ['data'],
        message: 'Expected object, received string',
      },
      {
        validation: 'regex',
        code: 'invalid_string',
        message: 'Invalid',
        path: ['signature'],
      },
    ];
    expect(console.log).toHaveBeenCalledWith(
      `Failed to parse signed data response for gateway: "https://gateway-2.com/endpoint". Error: "${JSON.stringify(
        zodErrors,
        null,
        2
      )}"`
    );
    expect(console.log).toBeCalledWith(
      `Using the following signed data response: "${JSON.stringify(validSignedData)}"`
    );
  });

  it('handles a case when all gateways error out', async () => {
    const mockedAxios = (axios as any as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('timeout error');
      })
      .mockReturnValueOnce({
        data: {
          data: 'invalid',
          signature: validSignedData.signature,
        },
      });
    jest.spyOn(global.console, 'log');

    const response = await makeSignedDataGatewayRequests(
      [
        { apiKey: 'api-key-1', url: 'https://gateway-1.com/' },
        { apiKey: 'api-key-2', url: 'https://gateway-2.com/' },
      ],
      { parameters: '0x123456789', endpointId: 'endpoint' },
      100
    );

    expect(response).toEqual(null);
    expect(mockedAxios).toHaveBeenCalledTimes(2);
    expect(console.log).toHaveBeenCalledWith(
      'Failed to make signed data gateway request for gateway: "https://gateway-1.com/endpoint". Error: "Error: timeout error"'
    );
    const zodErrors = [
      {
        code: 'invalid_type',
        expected: 'object',
        received: 'string',
        path: ['data'],
        message: 'Expected object, received string',
      },
    ];
    expect(console.log).toHaveBeenCalledWith(
      `Failed to parse signed data response for gateway: "https://gateway-2.com/endpoint". Error: "${JSON.stringify(
        zodErrors,
        null,
        2
      )}"`
    );
    expect(console.log).toBeCalledWith(`All gateway requests have failed with an error. No response to be used`);
  });
});
