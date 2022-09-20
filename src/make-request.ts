import { go } from '@api3/promise-utils';
import axios from 'axios';
import anyPromise from 'promise.any';
import { logger } from './logging';
import { Gateway, SignedData, signedDataSchema, signedDataSchemaLegacy, Template } from './validation';
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
  const { endpointId, parameters, id: templateId } = template;
  const logOptionsTemplateId = { meta: { 'Template-ID': templateId } };

  // Initiate HTTP request to each of the gateways and resolve with the data (or reject otherwise)
  const requests = gateways.map(async (gateway) => {
    const { apiKey, url } = gateway;

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
      logger.warn(message, logOptionsTemplateId);
      throw new Error(message);
    }

    let parsed;
    // We try first parsing signed data response prior to v0.8.0
    const parsedLegacy = signedDataSchemaLegacy.safeParse(goRes.data);
    if (parsedLegacy.success) {
      parsed = {
        data: {
          timestamp: parsedLegacy.data.data.timestamp,
          encodedValue: parsedLegacy.data.data.value,
          signature: parsedLegacy.data.signature,
        },
      };
    } else {
      // If above fails then we try parsing v0.8.0 response
      parsed = signedDataSchema.safeParse(goRes.data);
      if (!parsed.success) {
        const message = `Failed to parse signed data response for gateway: "${fullUrl}". Error: "${parsed.error}"`;
        logger.warn(message, logOptionsTemplateId);
        throw new Error(message);
      }
    }

    return parsed.data;
  });

  // Resolve with the first resolved gateway requests
  const goResult = await go(() => anyPromise(requests));
  if (!goResult.success) {
    const message = 'All gateway requests have failed with an error. No response to be used';
    logger.warn(message, logOptionsTemplateId);
    throw new Error(message);
  }

  // TODO: It might be nice to gather statistics about what gateway is the data coming from (for statistics)
  logger.info(`Using the following signed data response: "${JSON.stringify(goResult.data)}"`, logOptionsTemplateId);
  return goResult.data;
};
