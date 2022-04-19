import { z } from 'zod';
import { chainOptionsSchema, providerSchema } from '@api3/airnode-validator';

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
export const beaconSetsSchema = emptyObjectSchema;

export const chainSchema = z
  .object({
    contracts: z.record(evmAddressSchema),
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
    airseekerWalletMnemonic: z.string(),
    beacons: beaconsSchema,
    beaconSets: beaconSetsSchema,
    chains: chainsSchema,
    gateways: gatewaysSchema,
    templates: templatesSchema,
    triggers: triggersSchema,
  })
  .strict();

export const encodedValueSchema = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
export const signatureSchema = z.string().regex(/^0x[a-fA-F0-9]{130}$/);
export const signedDataSchema = z.object({
  data: z.object({ timestamp: z.string(), value: encodedValueSchema }),
  signature: signatureSchema,
});

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
export type Address = z.infer<typeof evmAddressSchema>;
export type BeaconId = z.infer<typeof evmBeaconIdSchema>;
export type TemplateId = z.infer<typeof evmTemplateIdSchema>;
export type EndpointId = z.infer<typeof evmEndpointIdSchema>;
export type SignedData = z.infer<typeof signedDataSchema>;
