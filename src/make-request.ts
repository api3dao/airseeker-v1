import * as node from '@api3/airnode-node';
import * as abi from '@api3/airnode-abi';
import { go } from '@api3/promise-utils';
import { ethers } from 'ethers';
import axios from 'axios';
import anyPromise from 'promise.any';
import { logger } from './logging';
import { Gateway, SignedData, signedDataSchema, signedDataSchemaLegacy, Template, Endpoint } from './validation';
import { GATEWAY_TIMEOUT_MS, TOTAL_TIMEOUT_HEADROOM } from './constants';
import { Id, getState } from './state';

export const urlJoin = (baseUrl: string, endpointId: string) => {
  if (baseUrl.endsWith('/')) {
    return `${baseUrl}${endpointId}`;
  } else {
    return `${baseUrl}/${endpointId}`;
  }
};

export function signWithTemplateId(templateId: string, timestamp: string, data: string) {
  const { airseekerWalletPrivateKey } = getState();

  return new ethers.Wallet(airseekerWalletPrivateKey).signMessage(
    ethers.utils.arrayify(
      ethers.utils.keccak256(
        ethers.utils.solidityPack(['bytes32', 'uint256', 'bytes'], [templateId, timestamp, data || '0x'])
      )
    )
  );
}

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

    const goRes = await go(
      async () => {
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
      },
      { totalTimeoutMs: GATEWAY_TIMEOUT_MS - TOTAL_TIMEOUT_HEADROOM }
    );

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

export const makeApiRequest = async (template: Id<Template>): Promise<SignedData> => {
  const {
    config: { endpoints, ois, apiCredentials },
  } = getState();
  const logOptionsTemplateId = { meta: { 'Template-ID': template.id } };

  const parameters: node.ApiCallParameters = abi.decode(template.parameters);
  const endpoint: Endpoint = endpoints[template.endpointId];

  const aggregatedApiCall: node.BaseAggregatedApiCall = {
    parameters,
    ...endpoint,
  };
  const [_, apiCallResponse] = await node.api.callApi({
    type: 'http-gateway',
    config: { ois, apiCredentials },
    aggregatedApiCall,
  });

  if (!apiCallResponse.success) {
    const message = `Failed to make direct API request for the endpoint [${endpoint.oisTitle}] ${endpoint.endpointName}.`;
    logger.warn(message, logOptionsTemplateId);
    throw new Error(message);
  }

  const encodedValue = (apiCallResponse as node.HttpGatewayApiCallSuccessResponse).data.encodedValue;
  const timestamp = Math.floor(Date.now() / 1000).toString();

  const goSignWithTemplateId = await go(() => signWithTemplateId(template.id, timestamp, encodedValue));

  if (!goSignWithTemplateId.success) {
    const message = `Failed to sign data while making direct API request for the endpoint [${endpoint.oisTitle}] ${endpoint.endpointName}. Error: "${goSignWithTemplateId.error}"`;
    logger.warn(message, logOptionsTemplateId);
    throw new Error(message);
  }

  return {
    timestamp: timestamp,
    encodedValue: encodedValue,
    signature: goSignWithTemplateId.data,
  };
};
