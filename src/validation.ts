import { z } from 'zod';

export const evmAddressSchema = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
export const evmBeaconIdSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
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

export const beaconsSchema = z.record(evmBeaconIdSchema, beaconSchema);

// TODO: Will be refined once we start supporting beacon sets
export const beaonSetsSchema = emptyObjectSchema;

export const chainSchema = z
  .object({
    contracts: z.record(evmAddressSchema),
    providers: z.record(
      z.object({
        url: z.string().url(),
      })
    ),
    options: z.object({
      txType: z.string(),
      priorityFee: z.object({
        value: z.number(),
        unit: z.string(),
      }),
      baseFeeMultiplier: z.number(),
    }),
  })
  .strict();

export const chainsSchema = z.record(chainSchema);

export const gatewaySchema = z.array(
  z
    .object({
      apiKey: z.string(),
      url: z.string().url(),
    })
    .strict()
);

export const gatewaysSchema = z.record(evmAddressSchema, gatewaySchema);

export const templateSchema = z
  .object({
    endpointId: evmEndpointIdSchema,
    parameters: z.string(),
  })
  .strict();

export const templatesSchema = z.record(evmTemplateIdSchema, templateSchema);

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

export const configSchema = z
  .object({
    beacons: beaconsSchema,
    beaconSets: beaonSetsSchema,
    chains: chainsSchema,
    gateways: gatewaysSchema,
    templates: templatesSchema,
    triggers: triggersSchema,
  })
  .strict();

export type Config = z.infer<typeof configSchema>;
export type Beacon = z.infer<typeof beaconSchema>;
export type Beacons = z.infer<typeof beaconsSchema>;
export type Chain = z.infer<typeof chainSchema>;
export type Chains = z.infer<typeof chainsSchema>;
export type Gateway = z.infer<typeof gatewaySchema>;
export type Gateways = z.infer<typeof gatewaysSchema>;
export type Template = z.infer<typeof templateSchema>;
export type Templates = z.infer<typeof templatesSchema>;
export type BeaconUpdate = z.infer<typeof beaconUpdateSchema>;
export type BeaconUpdates = z.infer<typeof beaconUpdatesSchema>;
export type Triggers = z.infer<typeof triggersSchema>;
