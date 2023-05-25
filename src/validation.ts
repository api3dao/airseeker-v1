import { ethers } from 'ethers';
import { SuperRefinement, z } from 'zod';
import { oisSchema, OIS, Endpoint as oisEndpoint } from '@api3/ois';
import { config } from '@api3/airnode-validator';
import isNil from 'lodash/isNil';

export const logSchema = z.object({
  format: config.logFormatSchema,
  level: config.logLevelSchema,
});

export const limiterConfig = z.object({ minTime: z.number(), maxConcurrent: z.number() });

export const fetchMethodSchema = z.union([z.literal('gateway'), z.literal('api')]);

export const beaconSchema = z
  .object({
    airnode: config.evmAddressSchema,
    templateId: config.evmIdSchema,
    fetchInterval: z.number().int().positive(),
    fetchMethod: fetchMethodSchema,
  })
  .strict();

export const beaconsSchema = z.record(config.evmIdSchema, beaconSchema).superRefine((beacons, ctx) => {
  Object.entries(beacons).forEach(([beaconId, beacon]) => {
    // Verify that config.beacons.<beaconId> is valid
    // by deriving the hash of the airnode address and templateId
    const derivedBeaconId = ethers.utils.solidityKeccak256(['address', 'bytes32'], [beacon.airnode, beacon.templateId]);
    if (derivedBeaconId !== beaconId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Beacon ID "${beaconId}" is invalid`,
        path: [beaconId],
      });
    }
  });
});

export const beaconSetsSchema = z
  .record(config.evmIdSchema, z.array(config.evmIdSchema))
  .superRefine((beaconSets, ctx) => {
    Object.entries(beaconSets).forEach(([beaconSetId, beacons]) => {
      // Verify that config.beaconSets.<beaconSetId> is valid
      // by deriving the hash of the beaconIds in the array
      const derivedBeaconSetId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beacons]));
      if (derivedBeaconSetId !== beaconSetId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `BeaconSet ID "${beaconSetId}" is invalid`,
          path: [beaconSetId],
        });
      }
    });
  });

export const providerSchema = z
  .object({
    url: z.string().url(),
    rateLimiter: limiterConfig.optional(), // optionally specifies the rate limiter configuration per RPC URL
  })
  .strict();

export const chainSchema = z
  .object({
    contracts: z.record(config.evmAddressSchema).refine((contracts) => {
      return !isNil(contracts['Api3ServerV1']);
    }, 'Api3ServerV1 contract address is missing'),
    providers: z.record(providerSchema),
    options: config.chainOptionsSchema,
  })
  .strict();

export const chainsSchema = z.record(chainSchema);

export const gatewaySchema = z
  .object({
    apiKey: z.string().optional(),
    url: z.string().url(),
  })
  .strict();

export const gatewayArraySchema = z.array(gatewaySchema);

export const gatewaysSchema = z.record(gatewayArraySchema);

export const templateSchema = z
  .object({
    endpointId: config.evmIdSchema,
    parameters: z.string(),
  })
  .strict();

export const templatesSchema = z.record(config.evmIdSchema, templateSchema).superRefine((templates, ctx) => {
  Object.entries(templates).forEach(([templateId, template]) => {
    // Verify that config.templates.<templateId> is valid
    // by deriving the hash of the endpointId and parameters
    const derivedTemplateId = ethers.utils.solidityKeccak256(
      ['bytes32', 'bytes'],
      [template.endpointId, template.parameters]
    );
    if (derivedTemplateId !== templateId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Template ID "${templateId}" is invalid`,
        path: [templateId],
      });
    }
  });
});

export const endpointSchema = z.object({
  oisTitle: z.string(),
  endpointName: z.string(),
});

export const endpointsSchema = z.record(endpointSchema).superRefine((endpoints, ctx) => {
  Object.entries(endpoints).forEach(([endpointId, endpoint]) => {
    // Verify that config.endpoints.<endpointId> is valid
    // by deriving the hash of the oisTitle and endpointName

    const derivedEndpointId = ethers.utils.keccak256(
      ethers.utils.defaultAbiCoder.encode(['string', 'string'], [endpoint.oisTitle, endpoint.endpointName])
    );

    if (derivedEndpointId !== endpointId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Endpoint ID "${endpointId}" is invalid`,
        path: [endpointId],
      });
    }
  });
});

export const baseBeaconTriggerSchema = z.object({
  deviationThreshold: z.number(),
  heartbeatInterval: z.number().int(),
});

export const beaconTriggerSchema = z
  .object({
    beaconId: config.evmIdSchema,
  })
  .merge(baseBeaconTriggerSchema)
  .strict();

export const beaconSetTriggerSchema = z
  .object({
    beaconSetId: config.evmIdSchema,
  })
  .merge(baseBeaconTriggerSchema)
  .strict();

// chainId -> sponsorAddress -> dataFeeds
export const dataFeedUpdatesSchema = z.record(
  z.record(
    config.evmAddressSchema,
    z.object({
      beacons: z.array(beaconTriggerSchema),
      beaconSets: z.array(beaconSetTriggerSchema),
      updateInterval: z.number().int(),
    })
  )
);

export const triggersSchema = z.object({
  dataFeedUpdates: dataFeedUpdatesSchema,
});

const validateTemplatesReferences: SuperRefinement<{ beacons: Beacons; templates: Templates; endpoints: Endpoints }> = (
  config,
  ctx
) => {
  Object.entries(config.templates).forEach(([templateId, template]) => {
    // Verify that config.templates.<templateId>.endpointId is
    // referencing a valid config.endpoints.<endpointId> object

    // Only verify for `api` call endpoints
    if (
      Object.values(config.beacons).some(
        ({ templateId: tId, fetchMethod }) => fetchMethod === 'api' && tId === templateId
      )
    ) {
      const endpoint = config.endpoints[template.endpointId];
      if (isNil(endpoint)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Endpoint "${template.endpointId}" is not defined in the config.endpoints object`,
          path: ['templates', templateId, 'endpointId'],
        });
      }
    }
  });
};

const validateOisReferences: SuperRefinement<{ ois: OIS[]; endpoints: Endpoints }> = (config, ctx) => {
  Object.entries(config.endpoints).forEach(([endpointId, { oisTitle, endpointName }]) => {
    // Check existence of OIS related with oisTitle
    const oises = config.ois.filter(({ title }) => title === oisTitle);
    if (oises.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `OIS titled "${oisTitle}" is not defined in the config.ois object`,
        path: ['endpoints', endpointId, 'oisTitle'],
      });
      return;
    }
    // Take first OIS fits the filter rule, then check specific endpoint existence
    const ois = oises[0];
    const endpoints = ois.endpoints.filter(({ name }: oisEndpoint) => name === endpointName);

    if (endpoints.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `OIS titled "${oisTitle}" doesn't have referenced endpoint ${endpointName}`,
        path: ['endpoints', endpointId, 'endpointName'],
      });
    }
  });
};

const validateBeaconsReferences: SuperRefinement<{ beacons: Beacons; gateways: Gateways; templates: Templates }> = (
  config,
  ctx
) => {
  Object.entries(config.beacons).forEach(([beaconId, beacon]) => {
    // Unless selected fetchMethod is 'api',
    // Verify that config.beacons.<beaconId>.airnode is
    // referencing a valid config.gateways.<airnode> object
    if (beacon.fetchMethod !== 'api') {
      const airnode = config.gateways[beacon.airnode];
      if (isNil(airnode)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Gateway "${beacon.airnode}" is not defined in the config.gateways object`,
          path: ['beacons', beaconId, 'airnode'],
        });
      }
    }

    // Verify that config.beacons.<beaconId>.templateId is
    // referencing a valid config.templates.<templateId> object
    const template = config.templates[beacon.templateId];
    if (isNil(template)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Template ID "${beacon.templateId}" is not defined in the config.templates object`,
        path: ['beacons', beaconId, 'templateId'],
      });
    }
  });
};

const validateBeaconSetsReferences: SuperRefinement<{ beacons: Beacons; beaconSets: BeaconSets }> = (config, ctx) => {
  Object.entries(config.beaconSets).forEach(([beaconSetId, beacons]) => {
    beacons.forEach((beaconId, index) => {
      // Verify that config.beaconSets.<beaconSetId>.[beaconId] is
      // referencing a valid config.beacons.<beaconId> object
      const beacon = config.beacons[beaconId];
      if (isNil(beacon)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Beacon ID "${beaconId}" is not defined in the config.beacons object`,
          path: ['beaconSets', beaconSetId, index],
        });
      }
    });
  });
};

export const rateLimitingSchema = z.object({
  maxGatewayConcurrency: z.number().optional(),
  minGatewayTime: z.number().optional(),
  maxProviderConcurrency: z.number().optional(),
  minProviderTime: z.number().optional(),
  minDirectGatewayTime: z.number().optional(),
  maxDirectGatewayConcurrency: z.number().optional(),
  overrides: z
    .object({
      signedDataGateways: z.record(limiterConfig).optional(), // key is Airnode address
      directGateways: z.record(limiterConfig).optional(), // key is ois title
    })
    .optional(),
});

const validateOisRateLimiterReferences: SuperRefinement<{ ois: OIS[]; rateLimiting?: RateLimitingConfig }> = (
  config,
  ctx
) => {
  const directGateways = config.rateLimiting?.overrides?.directGateways ?? {};
  const oises = config?.ois ?? [];

  Object.keys(directGateways).forEach((oisTitle) => {
    if (!oises.find((ois) => ois.title === oisTitle)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `OIS Title "${oisTitle}" in rate limiting overrides is not defined in the config.ois array`,
        path: ['rateLimiting', 'overrides', 'directGateways', oisTitle],
      });
    }
  });
};

const validateSignedDateGatewaysRateLimiterReferences: SuperRefinement<{
  gateways: Record<string, any>;
  rateLimiting?: RateLimitingConfig;
}> = (config, ctx) => {
  const signedDataGateways = config.rateLimiting?.overrides?.signedDataGateways ?? {};
  const gateways = config?.gateways ?? {};

  Object.keys(signedDataGateways).forEach((airnode) => {
    if (!gateways[airnode]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Airnode address "${airnode}" in rate limiting overrides is not defined in the gateways object`,
        path: ['rateLimiting', 'overrides', 'signedDataGateways', airnode],
      });
    }
  });
};

const validateDataFeedUpdatesReferences: SuperRefinement<{
  beacons: Beacons;
  beaconSets: BeaconSets;
  chains: Chains;
  triggers: Triggers;
}> = (config, ctx) => {
  Object.entries(config.triggers.dataFeedUpdates).forEach(([chainId, dataFeedUpdatesPerSponsor]) => {
    // Verify that config.triggers.dataFeedUpdates.<chainId> is
    // referencing a valid config.chains.<chainId> object
    if (!config.chains[chainId]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Chain ID "${chainId}" is not defined in the config.chains object`,
        path: ['triggers', 'dataFeedUpdates', chainId],
      });
    }
    Object.entries(dataFeedUpdatesPerSponsor).forEach(([sponsorAddress, dataFeedUpdate]) => {
      dataFeedUpdate.beacons.forEach((beacon, index) => {
        // Verify that config.triggers.dataFeedUpdates.<chainId>.<sponsorAddress>.beacons.beaconId is
        // referencing a valid config.beacons.<beaconId> object
        if (!config.beacons[beacon.beaconId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Beacon ID "${beacon.beaconId}" is not defined in the config.beacons object`,
            path: ['triggers', 'dataFeedUpdates', chainId, sponsorAddress, 'beacons', index],
          });
        }
      });
      dataFeedUpdate.beaconSets.forEach((beaconSet, index) => {
        // Verify that config.triggers.dataFeedUpdates.<chainId>.<sponsorAddress>.beaconSets.beaconSetId is
        // referencing a valid config.beaconSets.<beaconSetId> object
        if (!config.beaconSets[beaconSet.beaconSetId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `BeaconSet ID "${beaconSet.beaconSetId}" is not defined in the config.beaconSets object`,
            path: ['triggers', 'dataFeedUpdates', chainId, sponsorAddress, 'beaconSets', index],
          });
        }
      });
    });
  });
};

export const configSchema = z
  .object({
    airseekerWalletMnemonic: z.string(),
    monitoring: z
      .object({
        monitorOnly: z.boolean(),
        deviationMultiplier: z.number(),
        heartbeatMultiplier: z.number(),
        opsGenieApiKey: z.string(),
      })
      .deepPartial()
      .optional(),
    log: logSchema,
    beacons: beaconsSchema,
    beaconSets: beaconSetsSchema,
    chains: chainsSchema,
    gateways: gatewaysSchema,
    templates: templatesSchema,
    triggers: triggersSchema,
    ois: z.array(oisSchema),
    apiCredentials: z.array(config.apiCredentialsSchema),
    endpoints: endpointsSchema,
    rateLimiting: rateLimitingSchema.optional(),
  })
  .strict()
  .superRefine(validateBeaconsReferences)
  .superRefine(validateBeaconSetsReferences)
  .superRefine(validateTemplatesReferences)
  .superRefine(validateOisReferences)
  .superRefine(validateDataFeedUpdatesReferences)
  .superRefine(validateOisRateLimiterReferences)
  .superRefine(validateSignedDateGatewaysRateLimiterReferences);
export const encodedValueSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const signatureSchema = z.string().regex(/^0x[a-fA-F0-9]{130}$/);
export const signedDataSchemaLegacy = z.object({
  data: z.object({ timestamp: z.string(), value: encodedValueSchema }),
  signature: signatureSchema,
});
export const signedDataSchema = z.object({
  timestamp: z.string(),
  encodedValue: encodedValueSchema,
  signature: signatureSchema,
});

export type Config = z.infer<typeof configSchema>;
export type Beacon = z.infer<typeof beaconSchema>;
export type Beacons = z.infer<typeof beaconsSchema>;
export type BeaconSets = z.infer<typeof beaconSetsSchema>;
export type Chain = z.infer<typeof chainSchema>;
export type Chains = z.infer<typeof chainsSchema>;
export type Gateway = z.infer<typeof gatewaySchema>;
export type Gateways = z.infer<typeof gatewaysSchema>;
export type Template = z.infer<typeof templateSchema>;
export type Templates = z.infer<typeof templatesSchema>;
export type DataFeedUpdates = z.infer<typeof dataFeedUpdatesSchema>;
export type BeaconTrigger = z.infer<typeof beaconTriggerSchema>;
export type BeaconSetTrigger = z.infer<typeof beaconSetTriggerSchema>;
export type Triggers = z.infer<typeof triggersSchema>;
export type Address = z.infer<typeof config.evmAddressSchema>;
export type BeaconId = z.infer<typeof config.evmIdSchema>;
export type TemplateId = z.infer<typeof config.evmIdSchema>;
export type EndpointId = z.infer<typeof config.evmIdSchema>;
export type SignedData = z.infer<typeof signedDataSchema>;
export type Endpoint = z.infer<typeof endpointSchema>;
export type Endpoints = z.infer<typeof endpointsSchema>;
export type FetchMethod = z.infer<typeof fetchMethodSchema>;
export type LimiterConfig = z.infer<typeof limiterConfig>;
export type RateLimitingConfig = z.infer<typeof rateLimitingSchema>;
