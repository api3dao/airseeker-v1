import { go } from '@api3/promise-utils';
import axios from 'axios';
import anyPromise from 'promise.any';
import { logger } from './logging';
import { Gateway, SignedData, signedDataSchema, Template } from './validation';
import { GATEWAY_TIMEOUT_MS } from './constants';
import { Id } from './state';

export const urlJoin = (baseUrl: string, endpointId: string) => {
  if (baseUrl.endsWith('/')) {
    return `${baseUrl}${endpointId}`;
  } else {
    return `${baseUrl}/${endpointId}`;
  }
};

export const makeSignedDataGatewayRequests = async (
  gateways: Gateway[],
  template: Id<Template>
): Promise<SignedData> => {
  const logOptionsTemplateId = { additional: { 'Template-ID': template.id } };

  // Initiate HTTP request to each of the gateways and resolve with the data (or reject otherwise)
  const requests = gateways.map(async (gateway) => {
    const { apiKey, url } = gateway;
    const { endpointId, parameters } = template;
    const fullUrl = urlJoin(url, endpointId);

    const goRes = await go(async () => {
      const { data } = await axios({
        url: fullUrl,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'x-api-key': apiKey,
        },
        data: { encodedParameters: parameters },
        timeout: GATEWAY_TIMEOUT_MS,
      });

      return data;
    });

    if (!goRes.success) {
      const message = `Failed to make signed data gateway request for gateway: "${fullUrl}". Error: "${goRes.error}"`;
      logger.error(message, logOptionsTemplateId);
      throw new Error(message);
    }

    const parsed = signedDataSchema.safeParse(goRes.data);
    if (!parsed.success) {
      const message = `Failed to parse signed data response for gateway: "${fullUrl}". Error: "${parsed.error}"`;
      logger.error(message, logOptionsTemplateId);
      throw new Error(message);
    }

    return parsed.data;
  });

  // Resolve with the first resolved gateway requests
  const goResult = await go(() => anyPromise(requests));
  if (!goResult.success) {
    const message = 'All gateway requests have failed with an error. No response to be used';
    logger.error(message, logOptionsTemplateId);
    throw new Error(message);
  }

  // TODO: It might be nice to gather statistics about what gateway is the data coming from (for statistics)
  logger.log(`Using the following signed data response: "${JSON.stringify(goResult.data)}"`, logOptionsTemplateId);
  return goResult.data;
};
