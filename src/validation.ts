import { ethers } from 'ethers';
import { SuperRefinement, z } from 'zod';
import isNil from 'lodash/isNil';

export const logFormatSchema = z.union([z.literal('json'), z.literal('plain')]);
export const logLevelSchema = z.union([z.literal('DEBUG'), z.literal('INFO'), z.literal('WARN'), z.literal('ERROR')]);

export const logSchema = z.object({
  format: logFormatSchema,
  level: logLevelSchema,
});

export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const evmBeaconIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const evmBeaconSetIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const evmTemplateIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const evmEndpointIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const emptyObjectSchema = z.object({}).strict();

export const beaconSchema = z
  .object({
    airnode: evmAddressSchema,
    templateId: evmTemplateIdSchema,
    fetchInterval: z.number().int().positive(),
  })
  .strict();

export const beaconsSchema = z.record(evmBeaconIdSchema, beaconSchema).superRefine((beacons, ctx) => {
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
  .record(evmBeaconSetIdSchema, z.array(evmBeaconIdSchema))
  .superRefine((beaconSets, ctx) => {
    Object.entries(beaconSets).forEach(([beaconSetId, beacons]) => {
      // Verify that config.beaconSets.<beaconSetId> is valid
      // by deriving the hash of the beaconIds in the array
      const derivedBeaconSetId = ethers.utils.keccak256(ethers.utils.defaultAbiCoder.encode(['bytes32[]'], [beacons]));
      if (derivedBeaconSetId !== beaconSetId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Beacon set ID "${beaconSetId}" is invalid`,
          path: [beaconSetId],
        });
      }
    });
  });

export const latestGasPriceOptionsSchema = z
  .object({
    percentile: z.number().int().optional(),
    minTransactionCount: z.number().int().optional(),
    pastToCompareInBlocks: z.number().int().optional(),
    maxDeviationMultiplier: z.number().optional(),
  })
  .optional();

export const amountSchema = z
  .object({
    value: z.number().lte(9007199254740991), // 2**53 - 1
    unit: z.union([
      z.literal('wei'),
      z.literal('kwei'),
      z.literal('mwei'),
      z.literal('gwei'),
      z.literal('szabo'),
      z.literal('finney'),
      z.literal('ether'),
    ]),
  })
  .strict();

export const gasOracleSchema = z.object({
  fallbackGasPrice: amountSchema,
  recommendedGasPriceMultiplier: z.number().positive().optional(),
  latestGasPriceOptions: latestGasPriceOptionsSchema,
  maxTimeout: z.number().int().optional(),
});

const chainOptionsErrorMap: z.ZodErrorMap = (issue, ctx) => {
  if (issue.code === z.ZodIssueCode.unrecognized_keys) {
    return {
      message: `Unrecognized or disallowed key(s) for the given transaction type: ${issue.keys
        .map((val) => `'${val}'`)
        .join(', ')}`,
    };
  }
  return { message: ctx.defaultError };
};

export const chainOptionsSchema = z.discriminatedUnion('txType', [
  z
    .object(
      {
        txType: z.literal('eip1559'),
        baseFeeMultiplier: z.number().int().optional(), // Defaults to BASE_FEE_MULTIPLIER defined in airnode-utilities
        priorityFee: amountSchema.optional(), // Defaults to PRIORITY_FEE_IN_WEI defined in airnode-utilities
        fulfillmentGasLimit: z.number().int(),
        withdrawalRemainder: amountSchema.optional(),
        gasOracle: gasOracleSchema,
      },
      { errorMap: chainOptionsErrorMap }
    )
    .strict(),
  z
    .object(
      {
        txType: z.literal('legacy'),
        // No multiplier is used by default. See airnode-utilities for details
        gasPriceMultiplier: z.number().optional(),
        fulfillmentGasLimit: z.number().int(),
        withdrawalRemainder: amountSchema.optional(),
        gasOracle: gasOracleSchema,
      },
      { errorMap: chainOptionsErrorMap }
    )
    .strict(),
]);

export const providerSchema = z
  .object({
    url: z.string().url(),
  })
  .strict();

export const chainSchema = z
  .object({
    contracts: z.record(evmAddressSchema).refine((contracts) => {
      return !isNil(contracts['DapiServer']);
    }, 'DapiServer contract address is missing'),
    providers: z.record(providerSchema),
    options: chainOptionsSchema,
  })
  .strict();

export const chainsSchema = z.record(chainSchema);

export const gatewaySchema = z
  .object({
    apiKey: z.string(),
    url: z.string().url(),
  })
  .strict();

export const gatewayArraySchema = z.array(gatewaySchema);

export const gatewaysSchema = z.record(gatewayArraySchema);

export const templateSchema = z
  .object({
    endpointId: evmEndpointIdSchema,
    parameters: z.string(),
  })
  .strict();

export const templatesSchema = z.record(evmTemplateIdSchema, templateSchema).superRefine((templates, ctx) => {
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

export const beaconUpdateSchema = z
  .object({
    beaconId: evmBeaconIdSchema,
    deviationThreshold: z.number(),
    heartbeatInterval: z.number().int(),
  })
  .strict();

export const beaconUpdatesSchema = z.record(
  z.record(
    evmAddressSchema,
    z.object({
      beacons: z.array(beaconUpdateSchema),
      updateInterval: z.number().int(),
    })
  )
);

export const triggersSchema = z.object({
  beaconUpdates: beaconUpdatesSchema,
  // TODO: Will be refined once we start supporting beacon sets
  beaconSetUpdates: emptyObjectSchema,
});

const validateBeaconsReferences: SuperRefinement<{ beacons: Beacons; gateways: Gateways; templates: Templates }> = (
  config,
  ctx
) => {
  Object.entries(config.beacons).forEach(([beaconId, beacon]) => {
    // Verify that config.beacons.<beaconId>.airnode is
    // referencing a valid config.gateways.<airnode> object
    const airnode = config.gateways[beacon.airnode];
    if (isNil(airnode)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Gateway "${beacon.airnode}" is not defined in the config.gateways object`,
        path: ['beacons', beaconId, 'airnode'],
      });
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

const validateBeaconUpdatesReferences: SuperRefinement<{
  beacons: Beacons;
  chains: Chains;
  triggers: Triggers;
}> = (config, ctx) => {
  Object.entries(config.triggers.beaconUpdates).forEach(([chainId, beaconUpdatesPerSponsor]) => {
    // Verify that config.triggers.beaconUpdates.<chainId> is
    // referencing a valid config.chains.<chainId> object
    if (!config.chains[chainId]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Chain ID "${chainId}" is not defined in the config.chains object`,
        path: ['triggers', 'beaconUpdates', chainId],
      });
    }
    Object.entries(beaconUpdatesPerSponsor).forEach(([sponsorAddress, beaconUpdate]) => {
      beaconUpdate.beacons.forEach((beacon, index) => {
        // Verify that config.triggers.beaconUpdates.<chainId>.<sponsorAddress>.beacons.beaconId is
        // referencing a valid config.beacons.<beaconId> object
        if (!config.beacons[beacon.beaconId]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Beacon ID "${beacon.beaconId}" is not defined in the config.beacons object`,
            path: ['triggers', 'beaconUpdates', chainId, sponsorAddress, 'beacons', index],
          });
        }
      });
    });
  });
};

export const configSchema = z
  .object({
    airseekerWalletMnemonic: z.string(),
    log: logSchema,
    beacons: beaconsSchema,
    beaconSets: beaconSetsSchema,
    chains: chainsSchema,
    gateways: gatewaysSchema,
    templates: templatesSchema,
    triggers: triggersSchema,
  })
  .strict()
  .superRefine(validateBeaconsReferences)
  .superRefine(validateBeaconSetsReferences)
  .superRefine(validateBeaconUpdatesReferences);
export const encodedValueSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const signatureSchema = z.string().regex(/^0x[a-fA-F0-9]{130}$/);
export const signedDataSchema = z.object({
  data: z.object({ timestamp: z.string(), value: encodedValueSchema }),
  signature: signatureSchema,
});

export type Config = z.infer<typeof configSchema>;
export type Beacon = z.infer<typeof beaconSchema>;
export type Beacons = z.infer<typeof beaconsSchema>;
export type BeaconSets = z.infer<typeof beaconSetsSchema>;
export type Chain = z.infer<typeof chainSchema>;
export type Chains = z.infer<typeof chainsSchema>;
export type GasOracleConfig = z.infer<typeof gasOracleSchema>;
export type Gateway = z.infer<typeof gatewaySchema>;
export type Gateways = z.infer<typeof gatewaysSchema>;
export type Template = z.infer<typeof templateSchema>;
export type Templates = z.infer<typeof templatesSchema>;
export type BeaconUpdate = z.infer<typeof beaconUpdateSchema>;
export type BeaconUpdates = z.infer<typeof beaconUpdatesSchema>;
export type Triggers = z.infer<typeof triggersSchema>;
export type Address = z.infer<typeof evmAddressSchema>;
export type BeaconId = z.infer<typeof evmBeaconIdSchema>;
export type TemplateId = z.infer<typeof evmTemplateIdSchema>;
export type EndpointId = z.infer<typeof evmEndpointIdSchema>;
export type SignedData = z.infer<typeof signedDataSchema>;
