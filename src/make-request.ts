import { go } from '@api3/promise-utils';
import axios from 'axios';
import anyPromise from 'promise.any';
import { Gateway, SignedData, signedDataSchema, Template } from './validation';

export const urlJoin = (baseUrl: string, endpointId: string) => {
  if (baseUrl.endsWith('/')) {
    return `${baseUrl}${endpointId}`;
  } else {
    return `${baseUrl}/${endpointId}`;
  }
};

export const makeSignedDataGatewayRequests = async (
  gateways: Gateway[],
  template: Template,
  timeoutMs: number
): Promise<SignedData | null> => {
  // Initiate HTTP request to each of the gateways and resolve with the data (or reject otherwise)
  const requests = gateways.map(async (gateway) => {
    const { apiKey, url } = gateway;
    const { endpointId, parameters } = template;
    const fullUrl = urlJoin(url, endpointId);

    const goRes = await go(async () => {
      const { data } = await axios({
        url: fullUrl,
        method: 'POST',
        headers: { 'x-api-key': apiKey },
        data: JSON.stringify({ encodedParameters: parameters }),
        timeout: timeoutMs,
      });

      return data;
    });

    if (!goRes.success) {
      const message = `Failed to make signed data gateway request for gateway: "${fullUrl}". Error: "${goRes.error}"`;
      console.log(message);
      throw new Error(message);
    }

    const parsed = signedDataSchema.safeParse(goRes.data);
    if (!parsed.success) {
      const message = `Failed to parse signed data response for gateway: "${fullUrl}". Error: "${parsed.error}"`;
      console.log(message);
      throw new Error(message);
    }

    return parsed.data;
  });

  // Resolve with the first resolved gateway requests
  const goResult = await go(() => anyPromise(requests));
  if (!goResult.success) {
    console.log('All gateway requests have failed with an error. No response to be used');
    return null;
  }

  // TODO: It might be nice to gather statistics about what gateway is the data coming from (for statistics)
  console.log(`Using the following signed data response: "${JSON.stringify(goResult.data)}"`);
  return goResult.data;
};
